import { pool, runMigrations } from '@flowforge/db';
import { startScheduler, stopScheduler } from '@flowforge/scheduler';
import { config } from './config.js';
import { buildServer } from './server.js';

async function main() {
  console.log('Starting FlowForge API server...');

  try {
    // 1. Run database migrations on startup
    console.log('Running database migrations...');
    await runMigrations();

    // 2. Start Scheduler loop (retry scheduler + lease sweeper)
    console.log('Starting Scheduler loops...');
    startScheduler(pool);
    console.log('Scheduler started');

    // 3. Build and start the Fastify server
    const server = await buildServer();

    await server.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });

    console.log(`FlowForge API listening on port ${config.PORT}`);

    // 4. Handle graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}. Starting graceful shutdown...`);

      // Close Fastify server
      try {
        await server.close();
        console.log('HTTP server closed');
      } catch (err) {
        console.error('Error during HTTP server shutdown:', err);
      }

      // Stop Scheduler
      try {
        stopScheduler();
        console.log('Scheduler stopped');
      } catch (err) {
        console.error('Error during Scheduler shutdown:', err);
      }

      // Close DB pool
      try {
        await pool.end();
        console.log('Database pool closed');
      } catch (err) {
        console.error('Error closing database pool:', err);
      }

      console.log('Graceful shutdown completed. Exiting process.');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    console.error('Failed to start FlowForge API server:', err);
    // Cleanup pool if it was initialized
    try {
      await pool.end();
    } catch (_) {}
    process.exit(1);
  }
}

// Execute the server boot sequence
main();
