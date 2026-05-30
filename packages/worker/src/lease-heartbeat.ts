import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { refreshLease } from '@flowforge/queue';

export function startLeaseHeartbeat(
  pool: Pool,
  stepRunId: string,
  workerId: string,
  leaseDurationSeconds: number,
  heartbeatIntervalMs: number,
  abortController: AbortController,
  logger: Logger
) {
  const timer = setInterval(async () => {
    try {
      const rows = await refreshLease(pool, stepRunId, workerId, leaseDurationSeconds);
      if (rows === 0) {
        logger.warn(
          { stepRunId },
          `Lease lost during heartbeat (rows = 0) — signaling abort to the handler`
        );
        abortController.abort(new Error('Lease lost during heartbeat'));
      } else {
        logger.debug({ stepRunId }, `Lease successfully refreshed`);
      }
    } catch (err) {
      logger.error({ err, stepRunId }, `Failed to refresh lease — signaling abort`);
      abortController.abort(err instanceof Error ? err : new Error(String(err)));
    }
  }, heartbeatIntervalMs);

  return {
    stop: () => {
      clearInterval(timer);
    }
  };
}
