import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { createReplayRun } from '@flowforge/engine';
import { publishStepEvent } from '@flowforge/events';

const replayParamsSchema = z.object({
  id: z.string().uuid('Workflow Run ID must be a valid UUID'),
});

const replayBodySchema = z.object({
  fromStepKey: z.string().min(1, 'fromStepKey is required'),
});

export const replayRoute: RouteHandler = async (request, reply) => {
  // 1. Validate params
  const paramsResult = replayParamsSchema.safeParse(request.params);
  if (!paramsResult.success) {
    return reply.code(404).send({
      error: { code: 'RUN_NOT_FOUND', message: 'Workflow run not found' },
    });
  }

  const originalRunId = paramsResult.data.id;

  // 2. Validate body
  const bodyResult = replayBodySchema.safeParse(request.body);
  if (!bodyResult.success) {
    return reply.code(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'fromStepKey is required',
        details: bodyResult.error.issues,
      },
    });
  }

  const { fromStepKey } = bodyResult.data;

  // 3. Verify actor identity
  const userId = request.userId;
  if (!userId) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  // 4. Fetch and validate original workflow run and steps before delegating to engine
  // This avoids engine errors and returns cleaner, specification-matched REST error codes.
  const originalRunRes = await pool.query(
    `SELECT id, status, workflow_id FROM workflow_runs WHERE id = $1`,
    [originalRunId]
  );

  if (originalRunRes.rows.length === 0) {
    return reply.code(404).send({
      error: { code: 'RUN_NOT_FOUND', message: 'Workflow run not found' },
    });
  }

  const originalRun = originalRunRes.rows[0];

  // Validate: original status must be FAILED or COMPLETED.
  // Return 409 if still RUNNING (or if CANCELLED since cancel is a terminal, non-replayable state).
  if (originalRun.status !== 'FAILED' && originalRun.status !== 'COMPLETED') {
    return reply.code(409).send({
      error: {
        code: 'INVALID_STATUS',
        message: `Original run is in status "${originalRun.status}". Only COMPLETED or FAILED runs can be replayed.`,
      },
    });
  }

  // Validate step key exists in the workflow
  const stepsRes = await pool.query(
    `SELECT id FROM workflow_steps WHERE workflow_id = $1 AND step_key = $2`,
    [originalRun.workflow_id, fromStepKey]
  );

  if (stepsRes.rows.length === 0) {
    return reply.code(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Step key "${fromStepKey}" does not exist in the workflow`,
      },
    });
  }

  // 5. Call createReplayRun from engine
  const replayRun = await createReplayRun(pool, originalRunId, fromStepKey, userId);

  // 6. Insert audit log row
  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
     VALUES ($1, 'run.replay', $2, $3)`,
    [userId, replayRun.id, { originalRunId }]
  );

  // 7. Publish events
  // Strictly satisfy the specification: Publish run.trigger event for the new run
  await publishStepEvent({
    type: 'run.trigger' as any,
    workflowRunId: replayRun.id,
    status: 'RUNNING',
    timestamp: new Date().toISOString(),
  });

  // Also publish step.queued events for the newly queued steps in the replay run
  for (const step of replayRun.steps) {
    if (step.status === 'QUEUED') {
      await publishStepEvent({
        type: 'step.queued',
        workflowRunId: replayRun.id,
        stepRunId: step.id,
        stepId: step.stepId,
        status: 'QUEUED',
        timestamp: new Date().toISOString(),
        attempt: 0,
      });
    }
  }

  return reply.code(202).send({ data: replayRun });
};
