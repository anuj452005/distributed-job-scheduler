import type { PoolClient } from 'pg';

export interface PreCreateStepInput {
  id: string; // step_id UUID
  input_config: Record<string, unknown>;
  retry_policy: {
    maxAttempts: number;
    baseDelayMs: number;
  };
}

/**
 * Pre-creates step runs in PENDING state in a single bulk INSERT.
 * Returns the mapping of step_id to step_run_id.
 */
export async function preCreateStepRuns(
  client: PoolClient,
  workflowRunId: string,
  steps: PreCreateStepInput[]
): Promise<Map<string, string>> {
  if (steps.length === 0) {
    return new Map();
  }

  const valuesClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  for (const step of steps) {
    const stepId = step.id;
    const idempotencyKey = `${workflowRunId}:${stepId}:1`;
    const inputPayload = JSON.stringify(step.input_config);
    const maxAttempts = step.retry_policy.maxAttempts;

    valuesClauses.push(
      `($${paramIndex}, $${paramIndex + 1}, 'PENDING', $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, NOW(), NOW())`
    );

    params.push(workflowRunId, stepId, idempotencyKey, inputPayload, maxAttempts);
    paramIndex += 5;
  }

  const query = `
    INSERT INTO step_runs
      (workflow_run_id, step_id, status, idempotency_key, input_payload,
       max_attempts, next_run_at, created_at)
    VALUES
      ${valuesClauses.join(',\n      ')}
    ON CONFLICT (workflow_run_id, step_id) DO NOTHING
    RETURNING id, step_id;
  `;

  const result = await client.query(query, params);

  const stepRunMap = new Map<string, string>();
  for (const row of result.rows) {
    stepRunMap.set(row.step_id, row.id);
  }

  return stepRunMap;
}
