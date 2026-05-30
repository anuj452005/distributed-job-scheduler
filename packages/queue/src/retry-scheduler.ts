import type { Pool } from 'pg';

export async function promoteDelayedRetries(pool: Pool): Promise<number> {
  const query = `
    UPDATE step_runs
    SET status = 'QUEUED'
    WHERE status     = 'RETRYING'
      AND next_run_at <= NOW()
    RETURNING id;
  `;
  const result = await pool.query(query);
  return result.rowCount ?? 0;
}
