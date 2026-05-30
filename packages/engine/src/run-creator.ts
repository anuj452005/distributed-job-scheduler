import type { Pool, PoolClient } from 'pg';
import type { WorkflowRunDto, StepRunDto } from '@flowforge/shared';
import { preCreateStepRuns } from './step-pre-creator.js';

/**
 * Helper to fetch a complete WorkflowRunDto from the database.
 */
export async function fetchWorkflowRunDto(
  client: Pool | PoolClient,
  runId: string
): Promise<WorkflowRunDto> {
  const runRes = await client.query(
    `SELECT id, workflow_id, status, input_payload, original_run_id, triggered_by, started_at, completed_at, created_at
     FROM workflow_runs
     WHERE id = $1`,
    [runId]
  );

  if (runRes.rows.length === 0) {
    throw new Error(`Workflow run not found: ${runId}`);
  }

  const runRow = runRes.rows[0];

  const stepsRes = await client.query(
    `SELECT sr.id, sr.step_id, ws.step_key, ws.handler_name, sr.status, sr.attempt_count,
            sr.max_attempts, sr.input_payload, sr.output_payload, sr.error_message,
            sr.worker_id, sr.started_at, sr.completed_at, sr.created_at
     FROM step_runs sr
     JOIN workflow_steps ws ON ws.id = sr.step_id
     WHERE sr.workflow_run_id = $1
     ORDER BY sr.created_at ASC`,
    [runId]
  );

  return {
    id: runRow.id,
    workflowId: runRow.workflow_id,
    status: runRow.status,
    inputPayload: runRow.input_payload,
    originalRunId: runRow.original_run_id,
    triggeredBy: runRow.triggered_by,
    startedAt: runRow.started_at ? runRow.started_at.toISOString() : null,
    completedAt: runRow.completed_at ? runRow.completed_at.toISOString() : null,
    createdAt: runRow.created_at.toISOString(),
    steps: stepsRes.rows.map(row => ({
      id: row.id,
      stepId: row.step_id,
      stepKey: row.step_key,
      handlerName: row.handler_name,
      status: row.status,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      inputPayload: row.input_payload,
      outputPayload: row.output_payload,
      errorMessage: row.error_message,
      workerId: row.worker_id,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    })),
  };
}

/**
 * Creates a workflow run and all its step runs in a single transaction,
 * and promotes root steps (those with zero dependencies) to QUEUED.
 */
export async function createWorkflowRun(
  pool: Pool,
  workflowId: string,
  inputPayload: Record<string, unknown>,
  triggeredBy: string
): Promise<WorkflowRunDto> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. INSERT workflow_runs row (status = 'PENDING')
    const runInsertRes = await client.query(
      `INSERT INTO workflow_runs (workflow_id, status, input_payload, triggered_by)
       VALUES ($1, 'PENDING', $2, $3)
       RETURNING id`,
      [workflowId, JSON.stringify(inputPayload), triggeredBy]
    );
    const workflowRunId = runInsertRes.rows[0].id;

    // 2. Fetch workflow_steps and step_dependencies for workflowId
    const stepsRes = await client.query(
      `SELECT id, step_key, handler_name, input_config, retry_policy, timeout_seconds
       FROM workflow_steps
       WHERE workflow_id = $1`,
      [workflowId]
    );

    const steps = stepsRes.rows;

    const depRes = await client.query(
      `SELECT sd.step_id, sd.depends_on_step_id
       FROM step_dependencies sd
       JOIN workflow_steps ws ON ws.id = sd.step_id
       WHERE ws.workflow_id = $1`,
      [workflowId]
    );

    const dependentStepIds = new Set<string>(depRes.rows.map(row => row.step_id));

    // 3. Pre-create all StepRun rows (status = 'PENDING')
    const preCreateInput = steps.map(s => ({
      id: s.id,
      input_config: s.input_config,
      retry_policy: s.retry_policy,
    }));

    await preCreateStepRuns(client, workflowRunId, preCreateInput);

    // 4. UPDATE workflow_runs SET status = 'RUNNING', started_at = NOW()
    await client.query(
      `UPDATE workflow_runs
       SET status = 'RUNNING', started_at = NOW()
       WHERE id = $1`,
      [workflowRunId]
    );

    // 5. For each root step (no dependencies): UPDATE step_runs SET status = 'QUEUED'
    const rootStepIds = steps
      .filter(s => !dependentStepIds.has(s.id))
      .map(s => s.id);

    if (rootStepIds.length > 0) {
      await client.query(
        `UPDATE step_runs
         SET status = 'QUEUED', next_run_at = NOW()
         WHERE workflow_run_id = $1 AND step_id = ANY($2::uuid[])`,
        [workflowRunId, rootStepIds]
      );
    }

    // 6. Fetch the completed WorkflowRunDto
    const runDto = await fetchWorkflowRunDto(client, workflowRunId);

    await client.query('COMMIT');
    return runDto;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
