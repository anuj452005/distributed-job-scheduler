import type { Pool, PoolClient } from 'pg';
import type { RetryPolicyRow } from '@flowforge/shared';
import { moveToDeadLetter } from './dead-letter.js';

export async function commitStepSuccess(
  pool: Pool,
  stepRunId: string,
  workerId: string,
  outputPayload: Record<string, unknown>
): Promise<number> {
  const query = `
    UPDATE step_runs
    SET
      status = 'SUCCEEDED',
      output_payload = $1,
      completed_at = NOW(),
      worker_id = NULL,
      lease_expires_at = NULL
    WHERE id = $2
      AND worker_id = $3
      AND status = 'RUNNING'
      AND lease_expires_at > NOW();
  `;
  const result = await pool.query(query, [
    JSON.stringify(outputPayload),
    stepRunId,
    workerId
  ]);
  return result.rowCount ?? 0;
}

export async function commitStepFailure(
  pool: Pool,
  stepRunId: string,
  workerId: string,
  errorMessage: string,
  retryPolicy: RetryPolicyRow
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // First fetch the current step run to check attempt count and workflow_run_id
    const selectQuery = `
      SELECT attempt_count, max_attempts, workflow_run_id
      FROM step_runs
      WHERE id = $1
        AND worker_id = $2
        AND status = 'RUNNING'
        AND lease_expires_at > NOW()
      FOR UPDATE;
    `;
    const selectResult = await client.query(selectQuery, [stepRunId, workerId]);
    if (selectResult.rowCount === 0 || !selectResult.rows[0]) {
      await client.query('ROLLBACK');
      return 0; // Fencing miss
    }

    const { attempt_count, max_attempts, workflow_run_id } = selectResult.rows[0];

    if (attempt_count < max_attempts) {
      // Retry policy delay calculation: baseDelay * 2^(attempt-1) + randomJitter(0..baseDelay)
      const attempt = attempt_count;
      const baseDelay = retryPolicy.baseDelayMs;
      const backoff = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * baseDelay);
      const retryDelayMs = backoff + jitter;

      const updateQuery = `
        UPDATE step_runs
        SET
          status = 'RETRYING',
          error_message = $1,
          next_run_at = NOW() + ($2 * INTERVAL '1 millisecond'),
          worker_id = NULL,
          lease_expires_at = NULL
        WHERE id = $3;
      `;
      await client.query(updateQuery, [errorMessage, retryDelayMs, stepRunId]);
    } else {
      // Dead-letter the step run
      const updateQuery = `
        UPDATE step_runs
        SET
          status = 'DEAD_LETTERED',
          error_message = $1,
          worker_id = NULL,
          lease_expires_at = NULL,
          completed_at = NOW()
        WHERE id = $2;
      `;
      await client.query(updateQuery, [errorMessage, stepRunId]);

      // Transition the parent workflow run to FAILED
      await moveToDeadLetter(client, workflow_run_id);
    }

    await client.query('COMMIT');
    return 1;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
