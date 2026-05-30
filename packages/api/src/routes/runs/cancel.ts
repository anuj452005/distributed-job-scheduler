import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { cancelWorkflowRun } from '@flowforge/engine';
import { publishStepEvent } from '@flowforge/events';

const cancelParamsSchema = z.object({
  id: z.string().uuid('Workflow Run ID must be a valid UUID'),
});

export const cancelRoute: RouteHandler = async (request, reply) => {
  // 1. Validate params
  const paramsResult = cancelParamsSchema.safeParse(request.params);
  if (!paramsResult.success) {
    return reply.code(404).send({
      error: { code: 'RUN_NOT_FOUND', message: 'Workflow run not found' },
    });
  }

  const runId = paramsResult.data.id;

  // 2. Verify actor identity
  const userId = request.userId;
  if (!userId) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  // 3. Check workflow run existence and status
  const runRes = await pool.query(
    `SELECT id, status FROM workflow_runs WHERE id = $1`,
    [runId]
  );

  if (runRes.rows.length === 0) {
    return reply.code(404).send({
      error: { code: 'RUN_NOT_FOUND', message: 'Workflow run not found' },
    });
  }

  const run = runRes.rows[0];

  // Validate run is RUNNING or PENDING. Return 409 if already terminal.
  if (run.status !== 'RUNNING' && run.status !== 'PENDING') {
    return reply.code(409).send({
      error: {
        code: 'INVALID_STATUS',
        message: `Workflow run is in status "${run.status}". Cannot cancel a run that is already terminal.`,
      },
    });
  }

  // 4. Query step run counts in PENDING/QUEUED and RUNNING before cancellation updates them
  const stepsRes = await pool.query(
    `SELECT status FROM step_runs WHERE workflow_run_id = $1`,
    [runId]
  );

  let cancelled = 0;
  let requested = 0;

  for (const row of stepsRes.rows) {
    if (row.status === 'PENDING' || row.status === 'QUEUED') {
      cancelled++;
    } else if (row.status === 'RUNNING') {
      requested++;
    }
  }

  // 5. Call cancelWorkflowRun from engine
  await cancelWorkflowRun(pool, runId);

  // 6. Publish workflow.cancelled event
  await publishStepEvent({
    type: 'workflow.cancelled',
    workflowRunId: runId,
    status: 'CANCELLED',
    timestamp: new Date().toISOString(),
  });

  // 7. Insert audit log row
  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
     VALUES ($1, 'run.cancel', $2, $3)`,
    [userId, runId, { cancelled, requested }]
  );

  // 8. Return successful response
  return reply.code(200).send({
    data: {
      runId,
      cancelled,
      requested,
    },
  });
};
