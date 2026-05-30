import pino from 'pino';
import { pool } from '@flowforge/db';
import { registerAllHandlers } from '@flowforge/handlers';
import { WorkerProcess } from './worker.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

async function main() {
  try {
    // 1. Register all step execution handlers
    registerAllHandlers();
    logger.info('Step handlers registered successfully');

    // 2. Read worker config from environment
    const pollIntervalMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '500', 10);
    const leaseDurationSeconds = parseInt(process.env.WORKER_LEASE_DURATION_SECONDS || '30', 10);
    const heartbeatIntervalSeconds = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_SECONDS || '10', 10);

    // 3. Initialize and start worker
    const worker = new WorkerProcess(pool, logger, {
      pollIntervalMs,
      leaseDurationSeconds,
      heartbeatIntervalMs: heartbeatIntervalSeconds * 1000,
    });

    await worker.start();
  } catch (err) {
    logger.fatal({ err }, 'Unhandled error during worker startup');
    process.exit(1);
  }
}

main();
