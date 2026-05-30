import type { Pool } from 'pg';
import type { WorkflowRunDto } from '@flowforge/shared';
import { preCreateStepRuns } from './step-pre-creator.js';
import { fetchWorkflowRunDto } from './run-creator.js';
import { promoteDownstreamSteps } from '@flowforge/queue';

/**
 * Creates a replay run starting from a specific step key.
 */
export async function createReplayRun(
  pool: Pool,
  originalRunId: string,
  fromStepKey: string,
  triggeredBy: string
): Promise<WorkflowRunDto> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch the original workflow_run
    const origRunRes = await client.query(
      `SELECT id, workflow_id, status, input_payload FROM workflow_runs WHERE id = $1`,
      [originalRunId]
    );
    if (origRunRes.rows.length === 0) {
      throw new Error(`Original workflow run not found: ${originalRunId}`);
    }
    const originalRun = origRunRes.rows[0];

    // 2. Validate: original run must be FAILED or COMPLETED
    if (originalRun.status !== 'COMPLETED' && originalRun.status !== 'FAILED') {
      throw new Error(
        `Cannot replay workflow run ${originalRunId} in status "${originalRun.status}". Must be COMPLETED or FAILED.`
      );
    }

    const workflowId = originalRun.workflow_id;

    // Fetch the step definitions for this workflow
    const stepsRes = await client.query(
      `SELECT id, step_key, handler_name, input_config, retry_policy, timeout_seconds FROM workflow_steps WHERE workflow_id = $1`,
      [workflowId]
    );
    const steps = stepsRes.rows;

    const fromStep = steps.find(s => s.step_key === fromStepKey);
    if (!fromStep) {
      throw new Error(`Step key "${fromStepKey}" not found in workflow`);
    }

    // Fetch original step runs to copy their output payloads
    const origStepRunsRes = await client.query(
      `SELECT sr.step_id, sr.output_payload
       FROM step_runs sr
       WHERE sr.workflow_run_id = $1`,
      [originalRunId]
    );

    const origOutputs = new Map<string, Record<string, unknown> | null>();
    for (const row of origStepRunsRes.rows) {
      origOutputs.set(row.step_id, row.output_payload);
    }

    // Fetch step dependencies to construct downstream traversal graph
    const depRes = await client.query(
      `SELECT sd.step_id, sd.depends_on_step_id
       FROM step_dependencies sd
       JOIN workflow_steps ws ON ws.id = sd.step_id
       WHERE ws.workflow_id = $1`,
      [workflowId]
    );
    const dependencies = depRes.rows;

    const dependentStepIds = new Set<string>(dependencies.map(row => row.step_id));

    // Map: dependency step_id -> array of step_ids that depend on it
    const dependOnMe = new Map<string, string[]>();
    for (const s of steps) {
      dependOnMe.set(s.id, []);
    }
    for (const dep of dependencies) {
      const list = dependOnMe.get(dep.depends_on_step_id) || [];
      list.push(dep.step_id);
      dependOnMe.set(dep.depends_on_step_id, list);
    }

    // Build the set of step IDs in the active replay set (fromStep and downstream)
    const replayStepIds = new Set<string>();
    const queue: string[] = [fromStep.id];
    replayStepIds.add(fromStep.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const downstream = dependOnMe.get(curr) || [];
      for (const nextId of downstream) {
        if (!replayStepIds.has(nextId)) {
          replayStepIds.add(nextId);
          queue.push(nextId);
        }
      }
    }

    // 3. INSERT new workflow_runs row linked to original via original_run_id
    const newRunInsertRes = await client.query(
      `INSERT INTO workflow_runs (workflow_id, status, input_payload, original_run_id, triggered_by)
       VALUES ($1, 'PENDING', $2, $3, $4)
       RETURNING id`,
      [workflowId, JSON.stringify(originalRun.input_payload), originalRunId, triggeredBy]
    );
    const newWorkflowRunId = newRunInsertRes.rows[0].id;

    // 4. INSERT step_runs for ALL steps (all PENDING initially)
    const preCreateInput = steps.map(s => ({
      id: s.id,
      input_config: s.input_config,
      retry_policy: s.retry_policy,
    }));

    await preCreateStepRuns(client, newWorkflowRunId, preCreateInput);

    // 5. For steps BEFORE the replay point: mark them SUCCEEDED with original output_payload
    for (const s of steps) {
      if (!replayStepIds.has(s.id)) {
        const origOutput = origOutputs.get(s.id) || {};
        await client.query(
          `UPDATE step_runs
           SET status = 'SUCCEEDED', output_payload = $1, completed_at = NOW()
           WHERE workflow_run_id = $2 AND step_id = $3`,
          [JSON.stringify(origOutput), newWorkflowRunId, s.id]
        );
      }
    }

    // UPDATE workflow_runs to RUNNING
    await client.query(
      `UPDATE workflow_runs
       SET status = 'RUNNING', started_at = NOW()
       WHERE id = $1`,
      [newWorkflowRunId]
    );

    // 6. For the replay step and all downstream: leave as PENDING, then promote root(s)
    // Promote any root steps (those with zero dependencies) that are still PENDING
    const rootStepIds = steps
      .filter(s => !dependentStepIds.has(s.id))
      .map(s => s.id);

    const pendingRootsInReplay = rootStepIds.filter(id => replayStepIds.has(id));

    if (pendingRootsInReplay.length > 0) {
      await client.query(
        `UPDATE step_runs
         SET status = 'QUEUED', next_run_at = NOW()
         WHERE workflow_run_id = $1 AND step_id = ANY($2::uuid[])`,
        [newWorkflowRunId, pendingRootsInReplay]
      );
    }

    // Promote downstream steps (those whose dependencies are now all SUCCEEDED)
    await promoteDownstreamSteps(client as any, newWorkflowRunId);

    // 7. Fetch and return the new WorkflowRunDto
    const runDto = await fetchWorkflowRunDto(client, newWorkflowRunId);

    await client.query('COMMIT');
    return runDto;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
