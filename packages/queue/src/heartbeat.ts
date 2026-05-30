import type { Pool } from 'pg';

export async function refreshLease(
  pool: Pool,
  stepRunId: string,
  workerId: string,
  leaseDurationSeconds: number
): Promise<number> {
  const query = `
    UPDATE step_runs
    SET lease_expires_at = NOW() + ($1 * INTERVAL '1 second')
    WHERE id          = $2
      AND worker_id   = $3
      AND status      = 'RUNNING';
  `;
  const result = await pool.query(query, [
    leaseDurationSeconds,
    stepRunId,
    workerId
  ]);
  return result.rowCount ?? 0;
}
