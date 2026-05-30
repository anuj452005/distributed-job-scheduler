import Fastify, { type FastifyInstance } from 'fastify';
import { clerkPlugin } from '@clerk/fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { errorHandler } from './error-handler.js';
import { healthRoutes } from './routes/health.js';
import { workflowRoutes } from './routes/workflows/index.js';
import { runRoutes } from './routes/runs/index.js';
import { handlerRegistry, registerAllHandlers } from '@flowforge/handlers';

export async function buildServer(): Promise<FastifyInstance> {
  // Register all workflow handlers for DAG validation (guard against double-registration)
  if (handlerRegistry.getAll().length === 0) {
    registerAllHandlers();
  }

  const app = Fastify({
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

  // Enable CORS
  await app.register(cors, {
    origin: '*',
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

  // Register workflow routes under /api
  await app.register(workflowRoutes, { prefix: '/api' });

  // Register run routes under /api
  await app.register(runRoutes, { prefix: '/api' });

  return app;
}
