import pg from 'pg';
import type { WorkflowDto, CreateWorkflowBody, WorkflowStepInput } from '@flowforge/shared';

export type ListWorkflowsOptions = {
  page?: number;
  limit?: number;
  search?: string;
};

export type WorkflowDetailDto = WorkflowDto & {
  steps: Array<{
    id:              string;
    stepKey:         string;
    handlerName:     string;
    inputConfig:     Record<string, unknown>;
    retryPolicy:     { maxAttempts: number; baseDelayMs: number };
    timeoutSeconds:  number;
    dependsOn:       string[];
  }>;
};

export class WorkflowConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowConflictError';
  }
}

/**
 * Creates a workflow, its steps, and its dependencies in a single transaction.
 */
export async function createWorkflow(
  pool: pg.Pool,
  body: CreateWorkflowBody,
  userId: string
): Promise<WorkflowDto> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert workflow
    const workflowRes = await client.query(
      `INSERT INTO workflows (name, description, version, created_by)
       VALUES ($1, $2, 1, $3)
       RETURNING id, name, description, version, created_at, updated_at`,
      [body.name, body.description || null, userId]
    );
    const workflow = workflowRes.rows[0];

    // 2. Insert steps
    const stepIdsMap = new Map<string, string>(); // stepKey -> stepId
    for (const step of body.steps) {
      const stepRes = await client.query(
        `INSERT INTO workflow_steps (workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, step_key`,
        [
          workflow.id,
          step.stepKey,
          step.handlerName,
          JSON.stringify(step.inputConfig),
          JSON.stringify(step.retryPolicy),
          step.timeoutSeconds
        ]
      );
      stepIdsMap.set(stepRes.rows[0].step_key, stepRes.rows[0].id);
    }

    // 3. Insert dependencies
    for (const step of body.steps) {
      const stepId = stepIdsMap.get(step.stepKey)!;
      for (const depKey of step.dependsOn) {
        const depId = stepIdsMap.get(depKey);
        if (!depId) {
          throw new Error(`Step dependency "${depKey}" not found for step "${step.stepKey}"`);
        }
        await client.query(
          `INSERT INTO step_dependencies (step_id, depends_on_step_id)
           VALUES ($1, $2)`,
          [stepId, depId]
        );
      }
    }

    await client.query('COMMIT');

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      stepCount: body.steps.length,
      createdAt: workflow.created_at.toISOString(),
      updatedAt: workflow.updated_at.toISOString()
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists all workflows with pagination, optional search, and step counts.
 */
export async function listWorkflows(
  pool: pg.Pool,
  opts: ListWorkflowsOptions
): Promise<{ items: WorkflowDto[]; total: number }> {
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;
  const offset = (page - 1) * limit;
  const searchPattern = opts.search ? `%${opts.search}%` : null;

  // 1. Get total count
  const countRes = await pool.query(
    `SELECT COUNT(*)::int as total
     FROM workflows
     WHERE ($1::text IS NULL OR name ILIKE $1)`,
    [searchPattern]
  );
  const total = countRes.rows[0]?.total ?? 0;

  if (total === 0) {
    return { items: [], total: 0 };
  }

  // 2. Get paginated items with step counts
  const itemsRes = await pool.query(
    `SELECT w.id, w.name, w.description, w.version, w.created_at, w.updated_at,
            COALESCE(COUNT(s.id), 0)::int as "stepCount"
     FROM workflows w
     LEFT JOIN workflow_steps s ON w.id = s.workflow_id
     WHERE ($1::text IS NULL OR w.name ILIKE $1)
     GROUP BY w.id
     ORDER BY w.created_at DESC
     LIMIT $2 OFFSET $3`,
    [searchPattern, limit, offset]
  );

  const items: WorkflowDto[] = itemsRes.rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    stepCount: row.stepCount,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }));

  return { items, total };
}

/**
 * Retrieves a detailed workflow with its steps and dependency edges.
 */
export async function getWorkflow(
  pool: pg.Pool,
  id: string
): Promise<WorkflowDetailDto | null> {
  // 1. Fetch workflow metadata and step count
  const workflowRes = await pool.query(
    `SELECT w.id, w.name, w.description, w.version, w.created_at, w.updated_at,
            COALESCE(COUNT(s.id), 0)::int as "stepCount"
     FROM workflows w
     LEFT JOIN workflow_steps s ON w.id = s.workflow_id
     WHERE w.id = $1
     GROUP BY w.id`,
    [id]
  );

  if (workflowRes.rows.length === 0) {
    return null;
  }
  const workflowRow = workflowRes.rows[0];

  // 2. Fetch steps
  const stepsRes = await pool.query(
    `SELECT id, step_key, handler_name, input_config, retry_policy, timeout_seconds
     FROM workflow_steps
     WHERE workflow_id = $1
     ORDER BY created_at ASC`,
    [id]
  );

  // 3. Fetch dependencies
  const depRes = await pool.query(
    `SELECT sd.step_id, s_dep.step_key as depends_on_step_key
     FROM step_dependencies sd
     JOIN workflow_steps s_dep ON sd.depends_on_step_id = s_dep.id
     JOIN workflow_steps s_curr ON sd.step_id = s_curr.id
     WHERE s_curr.workflow_id = $1`,
    [id]
  );

  // Map steps and their dependencies
  const stepsMap = new Map<string, WorkflowDetailDto['steps'][number]>();
  for (const row of stepsRes.rows) {
    stepsMap.set(row.id, {
      id: row.id,
      stepKey: row.step_key,
      handlerName: row.handler_name,
      inputConfig: row.input_config,
      retryPolicy: row.retry_policy,
      timeoutSeconds: row.timeout_seconds,
      dependsOn: []
    });
  }

  for (const dep of depRes.rows) {
    const step = stepsMap.get(dep.step_id);
    if (step) {
      step.dependsOn.push(dep.depends_on_step_key);
    }
  }

  return {
    id: workflowRow.id,
    name: workflowRow.name,
    description: workflowRow.description,
    version: workflowRow.version,
    stepCount: workflowRow.stepCount,
    createdAt: workflowRow.created_at.toISOString(),
    updatedAt: workflowRow.updated_at.toISOString(),
    steps: Array.from(stepsMap.values())
  };
}

/**
 * Updates an existing workflow, incrementing its version by 1.
 */
export async function updateWorkflow(
  pool: pg.Pool,
  id: string,
  body: CreateWorkflowBody,
  userId: string
): Promise<WorkflowDto | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock workflow row and check existence
    const existRes = await client.query(
      `SELECT id FROM workflows WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (existRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    // 2. Update workflow metadata & version
    const workflowRes = await client.query(
      `UPDATE workflows
       SET name = $1, description = $2, version = version + 1, updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, description, version, created_at, updated_at`,
      [body.name, body.description || null, id]
    );
    const workflow = workflowRes.rows[0];

    // 3a. Delete existing runs (which cascades to step_runs and step_logs)
    // This is required because step_runs references workflow_steps without ON DELETE CASCADE
    await client.query(
      `DELETE FROM workflow_runs WHERE workflow_id = $1`,
      [id]
    );

    // 3b. Delete old steps (dependencies are deleted automatically by ON DELETE CASCADE)
    await client.query(
      `DELETE FROM workflow_steps WHERE workflow_id = $1`,
      [id]
    );

    // 4. Insert new steps
    const stepIdsMap = new Map<string, string>(); // stepKey -> stepId
    for (const step of body.steps) {
      const stepRes = await client.query(
        `INSERT INTO workflow_steps (workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, step_key`,
        [
          id,
          step.stepKey,
          step.handlerName,
          JSON.stringify(step.inputConfig),
          JSON.stringify(step.retryPolicy),
          step.timeoutSeconds
        ]
      );
      stepIdsMap.set(stepRes.rows[0].step_key, stepRes.rows[0].id);
    }

    // 5. Insert new dependencies
    for (const step of body.steps) {
      const stepId = stepIdsMap.get(step.stepKey)!;
      for (const depKey of step.dependsOn) {
        const depId = stepIdsMap.get(depKey);
        if (!depId) {
          throw new Error(`Step dependency "${depKey}" not found for step "${step.stepKey}"`);
        }
        await client.query(
          `INSERT INTO step_dependencies (step_id, depends_on_step_id)
           VALUES ($1, $2)`,
          [stepId, depId]
        );
      }
    }

    await client.query('COMMIT');

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      stepCount: body.steps.length,
      createdAt: workflow.created_at.toISOString(),
      updatedAt: workflow.updated_at.toISOString()
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Deletes a workflow, checking for running executions first.
 * Cleanly deletes associated workflow_runs and cascades.
 */
export async function deleteWorkflow(
  pool: pg.Pool,
  id: string
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock workflow and check existence
    const existRes = await client.query(
      `SELECT id FROM workflows WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (existRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    // 2. Check for active RUNNING runs
    const runRes = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM workflow_runs
         WHERE workflow_id = $1 AND status = 'RUNNING'
       ) as "hasActiveRuns"`,
      [id]
    );

    if (runRes.rows[0].hasActiveRuns) {
      await client.query('ROLLBACK');
      throw new WorkflowConflictError(`Cannot delete workflow with active running runs`);
    }

    // 3. Delete runs first (since there is no ON DELETE CASCADE on workflow_runs.workflow_id)
    // Deleting workflow_runs will cascade to step_runs and step_logs
    await client.query(
      `DELETE FROM workflow_runs WHERE workflow_id = $1`,
      [id]
    );

    // 4. Delete the workflow itself (cascades to workflow_steps and step_dependencies)
    await client.query(
      `DELETE FROM workflows WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
