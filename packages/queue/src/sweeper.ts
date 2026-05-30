import type { Pool } from 'pg';

export interface SweepResult {
  requeued: string[];
  deadLettered: string[];
}

export async function sweepExpiredLeases(pool: Pool): Promise<SweepResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Re-queue steps with remaining attempts
    const requeueQuery = `
      UPDATE step_runs
      SET
        status           = 'QUEUED',
        worker_id        = NULL,
        lease_expires_at = NULL,
        next_run_at      = NOW()
      WHERE status           = 'RUNNING'
        AND lease_expires_at < NOW()
        AND attempt_count    < max_attempts
      RETURNING id, workflow_run_id;
    `;
    const requeueResult = await client.query(requeueQuery);
    const requeuedIds = requeueResult.rows.map(row => row.id);

    // 2. Dead-letter exhausted steps
    const dlqQuery = `
      UPDATE step_runs
      SET
        status           = 'DEAD_LETTERED',
        worker_id        = NULL,
        lease_expires_at = NULL,
        completed_at     = NOW()
      WHERE status           = 'RUNNING'
        AND lease_expires_at < NOW()
        AND attempt_count    >= max_attempts
      RETURNING id, workflow_run_id;
    `;
    const dlqResult = await client.query(dlqQuery);
    const dlqIds = dlqResult.rows.map(row => row.id);

    // If any steps were dead-lettered, fail their parent workflow runs
    for (const row of dlqResult.rows) {
      await client.query(`
        UPDATE workflow_runs
        SET status = 'FAILED', completed_at = NOW()
        WHERE id = $1
          AND status NOT IN ('FAILED', 'CANCELLED', 'COMPLETED');
      `, [row.workflow_run_id]);
    }

    await client.query('COMMIT');

    return {
      requeued: requeuedIds,
      deadLettered: dlqIds
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
