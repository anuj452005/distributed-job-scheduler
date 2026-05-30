import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { publishStepEvent } from '@flowforge/events';

const retryStepParamsSchema = z.object({
  id: z.string().uuid('Step Run ID must be a valid UUID'),
});

export const retryStepRoute: RouteHandler = async (request, reply) => {
  // 1. Validate params
  const paramsResult = retryStepParamsSchema.safeParse(request.params);
  if (!paramsResult.success) {
    return reply.code(404).send({
      error: { code: 'STEP_RUN_NOT_FOUND', message: 'Step run not found' },
    });
  }

  const stepRunId = paramsResult.data.id;

  // 2. Verify actor identity
  const userId = request.userId;
  if (!userId) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  // 3. Database operations in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch the step run
    const stepRunRes = await client.query(
      `SELECT id, workflow_run_id, step_id, status FROM step_runs WHERE id = $1`,
      [stepRunId]
    );

    if (stepRunRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.code(404).send({
        error: { code: 'STEP_RUN_NOT_FOUND', message: 'Step run not found' },
      });
    }

    const stepRun = stepRunRes.rows[0];

    // Validate state
    if (stepRun.status !== 'DEAD_LETTERED' && stepRun.status !== 'FAILED') {
      await client.query('ROLLBACK');
      return reply.code(409).send({
        error: {
          code: 'INVALID_STATUS',
          message: `Step run is in status "${stepRun.status}". Must be DEAD_LETTERED or FAILED to retry.`,
        },
      });
    }

    // Reset step run: attempt_count = 0, status = 'QUEUED', error_message = NULL, next_run_at = NOW(), worker_id = NULL, lease_expires_at = NULL
    await client.query(
      `UPDATE step_runs
       SET attempt_count = 0,
           status = 'QUEUED',
           error_message = NULL,
           next_run_at = NOW(),
           worker_id = NULL,
           lease_expires_at = NULL,
           started_at = NULL,
           completed_at = NULL
       WHERE id = $1`,
      [stepRunId]
    );

    // Reset parent workflow run status to RUNNING if it is FAILED
    const parentRunRes = await client.query(
      `SELECT id, status FROM workflow_runs WHERE id = $1`,
      [stepRun.workflow_run_id]
    );

    if (parentRunRes.rows.length > 0 && parentRunRes.rows[0].status === 'FAILED') {
      await client.query(
        `UPDATE workflow_runs
         SET status = 'RUNNING',
             completed_at = NULL
         WHERE id = $1`,
         [stepRun.workflow_run_id]
      );
    }

    // Insert audit log row
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
       VALUES ($1, 'step.retry', $2, $3)`,
      [userId, stepRunId, { workflowRunId: stepRun.workflow_run_id }]
    );

    await client.query('COMMIT');

    // 4. Publish step.queued event via publishStepEvent()
    await publishStepEvent({
      type: 'step.queued',
      workflowRunId: stepRun.workflow_run_id,
      stepRunId: stepRunId,
      stepId: stepRun.step_id,
      status: 'QUEUED',
      timestamp: new Date().toISOString(),
      attempt: 0,
    });

    return reply.code(200).send({
      data: {
        stepRunId,
        status: 'QUEUED',
      },
    });

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
