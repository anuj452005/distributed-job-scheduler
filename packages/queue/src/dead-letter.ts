import type { Pool, PoolClient } from 'pg';

export async function moveToDeadLetter(
  client: Pool | PoolClient,
  workflowRunId: string
): Promise<number> {
  const query = `
    UPDATE workflow_runs
    SET status = 'FAILED', completed_at = NOW()
    WHERE id = $1
      AND status NOT IN ('FAILED', 'CANCELLED', 'COMPLETED');
  `;
  const result = await client.query(query, [workflowRunId]);
  return result.rowCount ?? 0;
}
