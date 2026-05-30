import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { generateWorkerId } from './worker-id.js';
import { setupGracefulShutdown } from './graceful-shutdown.js';
import { pollLoop, type PollLoopContext } from './poll-loop.js';

export class WorkerProcess {
  private readonly pool: Pool;
  private readonly logger: Logger;
  private readonly pollIntervalMs: number;
  private readonly leaseDurationSeconds: number;
  private readonly heartbeatIntervalMs: number;
  private readonly ctx: PollLoopContext;

  constructor(
    pool: Pool,
    logger: Logger,
    options: {
      pollIntervalMs?: number;
      leaseDurationSeconds?: number;
      heartbeatIntervalMs?: number;
    } = {}
  ) {
    this.pool = pool;
    this.logger = logger;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.leaseDurationSeconds = options.leaseDurationSeconds ?? 30;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10000;

    this.ctx = {
      isShuttingDown: false,
      workerId: generateWorkerId(),
      activeControllers: new Map(),
    };
  }

  async start(): Promise<void> {
    this.logger.info({ workerId: this.ctx.workerId }, 'Starting FlowForge Worker Process');

    // Register OS signals for graceful shutdown
    setupGracefulShutdown(this.ctx, this.pool, this.logger);

    // Start the poll loop
    await pollLoop(
      this.ctx,
      this.pool,
      this.logger,
      this.pollIntervalMs,
      this.leaseDurationSeconds,
      this.heartbeatIntervalMs
    );
  }

  getWorkerId(): string {
    return this.ctx.workerId;
  }
}
