import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { 
  claimNextStep, 
  commitStepSuccess, 
  commitStepFailure, 
  promoteDownstreamSteps 
} from '@flowforge/queue';
import { handlerRegistry } from '@flowforge/handlers';
import { startLeaseHeartbeat } from './lease-heartbeat.js';

export type PollLoopContext = {
  isShuttingDown: boolean;
  workerId: string;
  activeControllers: Map<string, AbortController>;
};

export async function pollLoop(
  ctx: PollLoopContext,
  pool: Pool,
  logger: Logger,
  pollIntervalMs: number,
  leaseDurationSeconds: number,
  heartbeatIntervalMs: number
): Promise<void> {
  logger.info(
    {
      workerId: ctx.workerId,
      pollIntervalMs,
      leaseDurationSeconds,
      heartbeatIntervalMs,
    },
    'Entering poll loop'
  );

  while (!ctx.isShuttingDown) {
    let stepRun = null;
    try {
      stepRun = await claimNextStep(pool, ctx.workerId, leaseDurationSeconds);
    } catch (err) {
      logger.error({ err }, 'Error claiming next step run from database');
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    if (!stepRun) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    const stepRunId = stepRun.id;
    logger.info({ stepRunId }, `Claimed step run for execution (attempt ${stepRun.attempt_count})`);

    const abortController = new AbortController();
    ctx.activeControllers.set(stepRunId, abortController);

    const heartbeat = startLeaseHeartbeat(
      pool,
      stepRunId,
      ctx.workerId,
      leaseDurationSeconds,
      heartbeatIntervalMs,
      abortController,
      logger
    );

    try {
      // 1. Fetch handler_name and retry_policy from workflow_steps using step_id
      const stepRes = await pool.query(
        `SELECT handler_name, retry_policy FROM workflow_steps WHERE id = $1`,
        [stepRun.step_id]
      );
      if (stepRes.rows.length === 0) {
        throw new Error(`Workflow step definition not found for step_id: ${stepRun.step_id}`);
      }
      const { handler_name, retry_policy } = stepRes.rows[0];

      // 2. Resolve handler
      if (!handlerRegistry.has(handler_name)) {
        throw new Error(`Handler "${handler_name}" is not registered`);
      }
      const handler = handlerRegistry.get(handler_name);

      // 3. Dispatch to handler
      const output = await handler(
        {
          workflowRunId:  stepRun.workflow_run_id,
          stepRunId:      stepRun.id,
          attempt:        stepRun.attempt_count,
          idempotencyKey: stepRun.idempotency_key,
          signal:         abortController.signal,
          logger:         logger.child({ stepRunId: stepRun.id }),
        },
        stepRun.input_payload,
      );

      // Normalize output to Record<string, unknown>
      let outputPayload: Record<string, unknown>;
      if (output !== null && typeof output === 'object' && !Array.isArray(output)) {
        outputPayload = output as Record<string, unknown>;
      } else {
        outputPayload = { result: output };
      }

      // 4. Commit success with fencing token (worker_id and lease check in WHERE clause)
      const rowsUpdated = await commitStepSuccess(pool, stepRunId, ctx.workerId, outputPayload);

      if (rowsUpdated === 0) {
        logger.warn(
          { stepRunId },
          'Lost lease on step commit — discarding result'
        );
        continue;
      }

      logger.info({ stepRunId }, 'Successfully completed step run');

      // 5. Promote downstream steps
      await promoteDownstreamSteps(pool, stepRun.workflow_run_id, stepRun.step_id);

      // 6. Check and complete the workflow run if all steps succeeded
      await checkAndCompleteWorkflowRun(pool, stepRun.workflow_run_id, logger);

    } catch (err) {
      logger.error({ err, stepRunId }, 'Error occurred during step execution');

      // Fetch retry policy delay calculation inputs from DB if they weren't fetched before
      let retryPolicyVal = null;
      try {
        const stepRes = await pool.query(
          `SELECT retry_policy FROM workflow_steps WHERE id = $1`,
          [stepRun.step_id]
        );
        if (stepRes.rows.length > 0) {
          retryPolicyVal = stepRes.rows[0].retry_policy;
        }
      } catch (policyErr) {
        logger.error({ policyErr, stepRunId }, 'Failed to fetch retry policy for failure commit');
      }

      // Default fallback retry policy if database fetch failed
      const activeRetryPolicy = retryPolicyVal || { maxAttempts: stepRun.max_attempts, baseDelayMs: 1000 };

      try {
        const rowsUpdated = await commitStepFailure(
          pool,
          stepRunId,
          ctx.workerId,
          err instanceof Error ? err.message : String(err),
          activeRetryPolicy
        );

        if (rowsUpdated === 0) {
          logger.warn({ stepRunId }, 'Lost lease on step failure commit');
        } else {
          logger.info({ stepRunId }, 'Committed step failure');
        }
      } catch (commitFailErr) {
        logger.error({ commitFailErr, stepRunId }, 'Failed to commit step failure to database');
      }

    } finally {
      heartbeat.stop();
      ctx.activeControllers.delete(stepRunId);
    }
  }
}

async function checkAndCompleteWorkflowRun(pool: Pool, workflowRunId: string, logger: Logger): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Count steps in this workflow run that are not SUCCEEDED
    const countQuery = `
      SELECT COUNT(*) as unfinished_count
      FROM step_runs
      WHERE workflow_run_id = $1
        AND status != 'SUCCEEDED';
    `;
    const countRes = await client.query(countQuery, [workflowRunId]);
    const unfinishedCount = parseInt(countRes.rows[0].unfinished_count, 10);

    if (unfinishedCount === 0) {
      // Transition parent workflow run to COMPLETED
      const updateQuery = `
        UPDATE workflow_runs
        SET status = 'COMPLETED', completed_at = NOW()
        WHERE id = $1
          AND status = 'RUNNING';
      `;
      const updateRes = await client.query(updateQuery, [workflowRunId]);
      if (updateRes.rowCount && updateRes.rowCount > 0) {
        logger.info({ workflowRunId }, 'Workflow run fully completed successfully');
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ error, workflowRunId }, 'Failed to check and complete workflow run');
  } finally {
    client.release();
  }
}
