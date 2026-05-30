import type { Pool } from 'pg';
import pino from 'pino';
import { sweepExpiredLeases, moveToDeadLetter } from '@flowforge/queue';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'lease-sweeper',
});

export async function getWorkflowRunIdForStep(
  pool: Pool,
  stepRunId: string
): Promise<string | null> {
  const result = await pool.query(
    'SELECT workflow_run_id FROM step_runs WHERE id = $1',
    [stepRunId]
  );
  return result.rows[0]?.workflow_run_id || null;
}

export async function runLeaseSweeperTick(pool: Pool): Promise<void> {
  const { requeued, deadLettered } = await sweepExpiredLeases(pool);

  if (requeued.length > 0) {
    logger.info({ count: requeued.length, ids: requeued }, 'Re-queued steps from crashed workers');
  }

  if (deadLettered.length > 0) {
    logger.warn({ count: deadLettered.length, ids: deadLettered }, 'Dead-lettered exhausted steps');

    for (const stepRunId of deadLettered) {
      const workflowRunId = await getWorkflowRunIdForStep(pool, stepRunId);
      if (workflowRunId) {
        await moveToDeadLetter(pool, workflowRunId);
      }
    }
  }
}

export function startLeaseSweeper(pool: Pool, intervalMs: number): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await runLeaseSweeperTick(pool);
    } catch (err) {
      logger.error({ err }, 'Lease sweeper tick failed');
    }
  }, intervalMs);
}
