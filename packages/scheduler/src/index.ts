import type { Pool } from 'pg';
import { startRetryScheduler } from './retry-scheduler.js';
import { startLeaseSweeper } from './lease-sweeper.js';
import { schedulerContext } from './scheduler-context.js';

export interface SchedulerHandle {
  stop(): void;
}

export function startScheduler(
  pool: Pool
): SchedulerHandle {
  if (schedulerContext.isRunning) {
    return {
      stop: stopScheduler,
    };
  }

  schedulerContext.isRunning = true;

  const retryIntervalMs = parseInt(process.env.SCHEDULER_POLL_INTERVAL_MS || '5000', 10);
  const sweeperIntervalMs = parseInt(process.env.SWEEPER_POLL_INTERVAL_MS || '15000', 10);

  schedulerContext.retryTimer = startRetryScheduler(pool, retryIntervalMs);
  schedulerContext.sweeperTimer = startLeaseSweeper(pool, sweeperIntervalMs);

  return {
    stop: stopScheduler,
  };
}

export function stopScheduler(): void {
  if (!schedulerContext.isRunning) {
    return;
  }

  if (schedulerContext.retryTimer) {
    clearInterval(schedulerContext.retryTimer);
    schedulerContext.retryTimer = null;
  }

  if (schedulerContext.sweeperTimer) {
    clearInterval(schedulerContext.sweeperTimer);
    schedulerContext.sweeperTimer = null;
  }

  schedulerContext.isRunning = false;
}
