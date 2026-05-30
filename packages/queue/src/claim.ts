import type { Pool } from 'pg';
import type { StepRunRow } from '@flowforge/shared';

export async function claimNextStep(
  pool: Pool,
  workerId: string,
  leaseDurationSeconds: number
): Promise<StepRunRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Select the next QUEUED step run using SKIP LOCKED
    const selectQuery = `
      SELECT id, workflow_run_id, step_id, input_payload, attempt_count,
             max_attempts, idempotency_key, priority
      FROM step_runs
      WHERE status = 'QUEUED'
        AND next_run_at <= NOW()
      ORDER BY priority DESC, next_run_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;
    `;

    const selectResult = await client.query(selectQuery);
    if (selectResult.rowCount === 0 || !selectResult.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const claimed = selectResult.rows[0];

    // 2. Update the status, worker_id, lease_expires_at, attempt_count, and started_at
    const updateQuery = `
      UPDATE step_runs
      SET
        status           = 'RUNNING',
        worker_id        = $1,
        lease_expires_at = NOW() + ($2 * INTERVAL '1 second'),
        attempt_count    = attempt_count + 1,
        started_at       = NOW()
      WHERE id = $3
      RETURNING *;
    `;

    const updateResult = await client.query(updateQuery, [
      workerId,
      leaseDurationSeconds,
      claimed.id
    ]);

    await client.query('COMMIT');
    return updateResult.rows[0] as StepRunRow;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
