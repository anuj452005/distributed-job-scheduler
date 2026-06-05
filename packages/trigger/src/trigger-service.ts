import type { Pool } from 'pg';
import { createWorkflowRun } from '@flowforge/engine';
import type { TriggerOptions, TriggerResult } from './types.js';

/**
 * Atomically claims a trigger execution slot and creates a WorkflowRun.
 *
 * Safety guarantees:
 * 1. If idempotencyKey is non-null, a second call with the same
 *    (triggerId, idempotencyKey) returns DEDUPLICATED without creating a run.
 * 2. If idempotencyKey is null (cron), each call always creates a new run.
 * 3. Execution dispatch (createWorkflowRun) happens OUTSIDE the claim
 *    transaction so that DB locks are not held during the engine call.
 */
export async function triggerWorkflow(
  pool: Pool,
  opts: TriggerOptions
): Promise<TriggerResult> {
  // Step 1: Atomic INSERT claim.
  // ON CONFLICT DO NOTHING returns 0 rows if the idempotency key already exists.
  const claimRes = await pool.query<{ id: string }>(
    `INSERT INTO workflow_trigger_executions
       (trigger_id, status, payload, idempotency_key, source_type)
     VALUES ($1, 'PENDING', $2, $3, $4)
     ON CONFLICT (trigger_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      opts.triggerId,
      JSON.stringify(opts.payload),
      opts.idempotencyKey ?? null,  // NULL → PostgreSQL treats as distinct
      opts.sourceType,
    ]
  );

  const claimId = claimRes.rows[0]?.id;
  if (!claimId) {
    // idempotency_key collision → safely skip
    return { status: 'DEDUPLICATED' };
  }

  // Step 2: Dispatch run creation (non-transactional, lock-free).
  try {
    const runDto = await createWorkflowRun(pool, opts.workflowId, opts.payload, opts.userId);

    await pool.query(
      `UPDATE workflow_trigger_executions
       SET status = 'SUCCEEDED', workflow_run_id = $1
       WHERE id = $2`,
      [runDto.id, claimId]
    );

    return { status: 'SUCCEEDED', runId: runDto.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    try {
      await pool.query(
        `UPDATE workflow_trigger_executions
         SET status = 'FAILED', error_message = $1
         WHERE id = $2`,
        [message, claimId]
      );
    } catch (dbErr) {
      // Log DB error to prevent masking the original trigger failure error.
      console.error('Failed to update workflow_trigger_executions status to FAILED:', dbErr);
    }

    return { status: 'FAILED', error: message };
  }
}
