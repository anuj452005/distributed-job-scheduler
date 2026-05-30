import type { Pool } from 'pg';
import type { Logger } from 'pino';

export type GracefulShutdownContext = {
  isShuttingDown: boolean;
  activeControllers: Map<string, AbortController>;
};

export function setupGracefulShutdown(
  ctx: GracefulShutdownContext,
  pool: Pool,
  logger: Logger
): void {
  const shutdown = async (signal: string) => {
    if (ctx.isShuttingDown) return;
    logger.info({ signal }, `Received ${signal} — shutting down worker gracefully`);
    ctx.isShuttingDown = true;

    // Signal all active handlers to cancel
    for (const [stepRunId, controller] of ctx.activeControllers.entries()) {
      logger.info({ stepRunId }, `Aborting step run due to graceful shutdown`);
      controller.abort();
    }

    // Wait up to 30s for active handlers to finish
    const deadline = Date.now() + 30_000;
    while (ctx.activeControllers.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (ctx.activeControllers.size > 0) {
      logger.warn(
        { activeCount: ctx.activeControllers.size },
        `Force-shutting down: some handlers did not finish within deadline`
      );
    } else {
      logger.info(`All active handlers finished cleanly`);
    }

    try {
      await pool.end();
      logger.info('Database connection pool closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database connection pool');
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
