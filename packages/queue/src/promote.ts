import type { Pool } from 'pg';

export async function promoteDownstreamSteps(
  pool: Pool,
  workflowRunId: string,
  succeededStepId?: string
): Promise<string[]> {
  const query = `
    UPDATE step_runs
    SET status = 'QUEUED', next_run_at = NOW()
    WHERE workflow_run_id = $1
      AND status = 'PENDING'
      AND id IN (
        -- steps whose ALL dependencies are now SUCCEEDED
        SELECT sr.id
        FROM step_runs sr
        JOIN step_dependencies sd ON sd.step_id = sr.step_id
        GROUP BY sr.id
        HAVING COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM step_runs dep
            WHERE dep.step_id = sd.depends_on_step_id
              AND dep.workflow_run_id = $1
              AND dep.status = 'SUCCEEDED'
          )
        ) = COUNT(*)
      )
    RETURNING id;
  `;
  const result = await pool.query(query, [workflowRunId]);
  return result.rows.map(row => row.id);
}
