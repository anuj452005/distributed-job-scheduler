import type { Pool } from 'pg';

/**
 * Cancels a workflow run by updating pending/queued steps to CANCELLED,
 * running steps to CANCEL_REQUESTED, and the workflow run itself to CANCELLED.
 * Returns the row count of updated workflow runs (1 if cancelled, 0 if already finished).
 */
export async function cancelWorkflowRun(
  pool: Pool,
  runId: string
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. UPDATE step_runs SET status = 'CANCELLED' for PENDING/QUEUED steps
    await client.query(
      `UPDATE step_runs
       SET status = 'CANCELLED'
       WHERE workflow_run_id = $1 AND status IN ('PENDING', 'QUEUED')`,
      [runId]
    );

    // 2. UPDATE step_runs SET status = 'CANCEL_REQUESTED' for RUNNING steps
    await client.query(
      `UPDATE step_runs
       SET status = 'CANCEL_REQUESTED'
       WHERE workflow_run_id = $1 AND status = 'RUNNING'`,
      [runId]
    );

    // 3. UPDATE workflow_runs SET status = 'CANCELLED', completed_at = NOW()
    const result = await client.query(
      `UPDATE workflow_runs
       SET status = 'CANCELLED', completed_at = NOW()
       WHERE id = $1 AND status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED')`,
      [runId]
    );

    await client.query('COMMIT');
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
