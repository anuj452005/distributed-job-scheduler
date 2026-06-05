import Fastify, { type FastifyInstance } from 'fastify';
import { clerkPlugin } from '@clerk/fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { errorHandler } from './error-handler.js';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhooks/webhook-routes.js';
import { workflowRoutes } from './routes/workflows/index.js';
import { runRoutes } from './routes/runs/index.js';
import { eventRoutes } from './routes/events/index.js';
import { statsRoutes } from './routes/stats.js';
import { triggerRoutes } from './routes/triggers/trigger-routes.js';
import { handlerRegistry, registerAllHandlers } from '@flowforge/handlers';
import { pool } from '@flowforge/db';
import { startEventTriggerListener } from './event-trigger-listener.js';


export async function buildServer(): Promise<FastifyInstance> {
  // Register all workflow handlers for DAG validation (guard against double-registration)
  if (handlerRegistry.getAll().length === 0) {
    registerAllHandlers();
  }

  const app = Fastify({
    connectionTimeout: 0, // 0 = no timeout (SSE connections are long-lived)
    logger: {
      transport: process.env.NODE_ENV === 'test' ? undefined : {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Enable raw body capture for HMAC validation
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      (req as any).rawBody = body;
      try {
        done(null, JSON.parse(body.toString()));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // Enable CORS
  await app.register(cors, {
    origin: '*',
  });

  // Extract token from query parameter for SSE EventSource support before Clerk auth hook runs
  app.addHook('onRequest', async (request, reply) => {
    const query = request.query as { token?: string } | undefined;
    if (query?.token) {
      request.headers.authorization = `Bearer ${query.token}`;
    }
  });

  // Clerk JWT verification plugin
  if (process.env.NODE_ENV !== 'test') {
    await app.register(clerkPlugin, {
      secretKey: config.CLERK_SECRET_KEY,
      publishableKey: config.CLERK_PUBLISHABLE_KEY,
    });
  }

  // Global error handler
  app.setErrorHandler(errorHandler);

  // Register health route
  await app.register(healthRoutes);

  // Register public webhook routes under /api
  await app.register(webhookRoutes, { prefix: '/api' });

  // Register workflow routes under /api
  await app.register(workflowRoutes, { prefix: '/api' });

  // Register run routes under /api
  await app.register(runRoutes, { prefix: '/api' });

  // Register events routes under /api
  await app.register(eventRoutes, { prefix: '/api' });

  // Register stats routes under /api
  await app.register(statsRoutes, { prefix: '/api' });

  // Register trigger routes under /api
  await app.register(triggerRoutes, { prefix: '/api' });

  // Start the event trigger listener and register onClose hook for graceful teardown
  const stopEventListener = await startEventTriggerListener(pool);
  app.addHook('onClose', async () => {
    await stopEventListener();
  });

  return app;
}
