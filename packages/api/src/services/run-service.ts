import pg from 'pg';
import { createWorkflowRun } from '@flowforge/engine';
import type { WorkflowRunDto, StepRunDto } from '@flowforge/shared';

export type WorkflowRunDetailDto = WorkflowRunDto & {
  workflowName: string;
};

export type RunSummaryDto = WorkflowRunDto & {
  workflowName: string;
};

export type ListRunsOptions = {
  page?: number;
  limit?: number;
  status?: string;
  workflowId?: string;
  from?: string;
  to?: string;
  userId?: string;
};

export class WorkflowNotFoundError extends Error {
  constructor(id: string) {
    super(`Workflow not found: ${id}`);
    this.name = 'WorkflowNotFoundError';
  }
}

export class WorkflowEmptyError extends Error {
  constructor(id: string) {
    super(`Workflow has no steps: ${id}`);
    this.name = 'WorkflowEmptyError';
  }
}

export class RunNotFoundError extends Error {
  constructor(id: string) {
    super(`Workflow run not found: ${id}`);
    this.name = 'RunNotFoundError';
  }
}

/**
 * Triggers a new workflow run.
 * Verifies workflow exists and has steps, calls engine's createWorkflowRun,
 * and inserts an audit log row (without logging inputPayload contents).
 */
export async function triggerRun(
  pool: pg.Pool,
  workflowId: string,
  inputPayload: Record<string, unknown>,
  userId: string
): Promise<WorkflowRunDto> {
  // 1. Check workflow exists and belongs to user
  const workflowRes = await pool.query(
    `SELECT id FROM workflows WHERE id = $1 AND created_by = $2`,
    [workflowId, userId]
  );
  if (workflowRes.rows.length === 0) {
    throw new WorkflowNotFoundError(workflowId);
  }

  // 2. Check workflow has steps
  const stepCountRes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM workflow_steps WHERE workflow_id = $1`,
    [workflowId]
  );
  const stepCount: number = stepCountRes.rows[0]?.count ?? 0;
  if (stepCount === 0) {
    throw new WorkflowEmptyError(workflowId);
  }

  // 3. Delegate to engine (handles run + step_run creation + root step promotion)
  const runDto = await createWorkflowRun(pool, workflowId, inputPayload, userId);

  // 4. Audit log — only log payload size, never contents
  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
     VALUES ($1, 'run.trigger', $2, $3)`,
    [
      userId,
      runDto.id,
      {
        workflowId,
        inputPayloadSize: JSON.stringify(inputPayload).length,
      },
    ]
  );

  return runDto;
}

/**
 * Returns the full run state with all step_runs, joined with workflow name.
 */
export async function getRunDetail(
  pool: pg.Pool,
  runId: string,
  userId: string
): Promise<WorkflowRunDetailDto | null> {
  const runRes = await pool.query(
    `SELECT wr.id, wr.workflow_id, w.name AS workflow_name, wr.status,
            wr.input_payload, wr.original_run_id, wr.triggered_by,
            wr.started_at, wr.completed_at, wr.created_at
     FROM workflow_runs wr
     JOIN workflows w ON w.id = wr.workflow_id
     WHERE wr.id = $1 AND w.created_by = $2`,
    [runId, userId]
  );

  if (runRes.rows.length === 0) {
    return null;
  }

  const runRow = runRes.rows[0];

  const stepsRes = await pool.query(
    `SELECT sr.id, sr.step_id, ws.step_key, ws.handler_name, sr.status,
            sr.attempt_count, sr.max_attempts, sr.input_payload,
            sr.output_payload, sr.error_message, sr.worker_id,
            sr.started_at, sr.completed_at, sr.created_at
     FROM step_runs sr
     JOIN workflow_steps ws ON ws.id = sr.step_id
     WHERE sr.workflow_run_id = $1
     ORDER BY sr.created_at ASC`,
    [runId]
  );

  // Fetch workflow-level step dependencies to build the DAG edges on the frontend
  const depsRes = await pool.query(
    `SELECT ws.step_key, dep_ws.step_key AS depends_on_key
     FROM step_dependencies sd
     JOIN workflow_steps ws ON ws.id = sd.step_id
     JOIN workflow_steps dep_ws ON dep_ws.id = sd.depends_on_step_id
     WHERE ws.workflow_id = $1`,
    [runRow.workflow_id]
  );

  // Map dependencies by stepKey
  const depMap = new Map<string, string[]>();
  for (const depRow of depsRes.rows) {
    const list = depMap.get(depRow.step_key) || [];
    list.push(depRow.depends_on_key);
    depMap.set(depRow.step_key, list);
  }

  const steps: StepRunDto[] = stepsRes.rows.map(row => ({
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
    startedAt: row.started_at ? (row.started_at as Date).toISOString() : null,
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
    dependsOn: depMap.get(row.step_key) || [],
  }));

  return {
    id: runRow.id,
    workflowId: runRow.workflow_id,
    workflowName: runRow.workflow_name,
    status: runRow.status,
    inputPayload: runRow.input_payload,
    originalRunId: runRow.original_run_id,
    triggeredBy: runRow.triggered_by,
    startedAt: runRow.started_at ? (runRow.started_at as Date).toISOString() : null,
    completedAt: runRow.completed_at ? (runRow.completed_at as Date).toISOString() : null,
    createdAt: (runRow.created_at as Date).toISOString(),
    steps,
  };
}

/**
 * Returns a paginated list of workflow runs with optional filters.
 */
export async function listRuns(
  pool: pg.Pool,
  opts: ListRunsOptions
): Promise<{ items: RunSummaryDto[]; total: number; page: number; limit: number }> {
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;
  const offset = (page - 1) * limit;

  // Build dynamic WHERE clauses
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.status) {
    conditions.push(`wr.status = $${paramIdx++}`);
    params.push(opts.status);
  }
  if (opts.workflowId) {
    conditions.push(`wr.workflow_id = $${paramIdx++}`);
    params.push(opts.workflowId);
  }
  if (opts.from) {
    conditions.push(`wr.created_at >= $${paramIdx++}`);
    params.push(opts.from);
  }
  if (opts.to) {
    conditions.push(`wr.created_at <= $${paramIdx++}`);
    params.push(opts.to);
  }
  if (opts.userId) {
    conditions.push(`w.created_by = $${paramIdx++}`);
    params.push(opts.userId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM workflow_runs wr
     JOIN workflows w ON w.id = wr.workflow_id
     ${whereClause}`,
    params
  );
  const total: number = countRes.rows[0]?.total ?? 0;

  if (total === 0) {
    return { items: [], total: 0, page, limit };
  }

  // Fetch paginated items
  const itemsRes = await pool.query(
    `SELECT wr.id, wr.workflow_id, w.name AS workflow_name, wr.status,
            wr.input_payload, wr.original_run_id, wr.triggered_by,
            wr.started_at, wr.completed_at, wr.created_at
     FROM workflow_runs wr
     JOIN workflows w ON w.id = wr.workflow_id
     ${whereClause}
     ORDER BY wr.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  const items: RunSummaryDto[] = itemsRes.rows.map(row => ({
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    status: row.status,
    inputPayload: row.input_payload,
    originalRunId: row.original_run_id,
    triggeredBy: row.triggered_by,
    startedAt: row.started_at ? (row.started_at as Date).toISOString() : null,
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
    steps: [],
  }));

  return { items, total, page, limit };
}

/**
 * Returns a paginated list of runs scoped to a specific workflow.
 */
export async function listRunsByWorkflow(
  pool: pg.Pool,
  workflowId: string,
  opts: Pick<ListRunsOptions, 'page' | 'limit' | 'status'>,
  userId: string
): Promise<{ items: RunSummaryDto[]; total: number; page: number; limit: number }> {
  return listRuns(pool, { ...opts, workflowId, userId });
}
