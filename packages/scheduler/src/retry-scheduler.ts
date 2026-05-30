import type { Pool } from 'pg';
import pino from 'pino';
import { promoteDelayedRetries } from '@flowforge/queue';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'retry-scheduler',
});

export async function runRetrySchedulerTick(pool: Pool): Promise<void> {
  const promoted = await promoteDelayedRetries(pool);
  if (promoted > 0) {
    logger.info({ promoted }, 'Promoted delayed retries to QUEUED');
  }
}

export function startRetryScheduler(pool: Pool, intervalMs: number): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await runRetrySchedulerTick(pool);
    } catch (err) {
      logger.error({ err }, 'Retry scheduler tick failed');
    }
  }, intervalMs);
}
