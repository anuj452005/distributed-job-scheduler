import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { subscribeToRunEvents, subscribeToGlobalEvents } from '@flowforge/events';
import type { StepEvent } from '@flowforge/shared';

const streamQuerySchema = z.object({
  runId: z.string().uuid('runId must be a valid UUID').optional(),
});

export const eventStreamRoute: RouteHandler = async (request, reply) => {
  // Validate request query parameters using Zod
  const queryResult = streamQuerySchema.safeParse(request.query);
  if (!queryResult.success) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: queryResult.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      },
    });
  }

  const { runId } = queryResult.data;

  // Set required headers for Server-Sent Events (SSE)
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
  reply.raw.flushHeaders();

  // Define callback helper to send formatted StepEvents to the client
  function sendEvent(event: StepEvent): void {
    reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  // Subscribe to Redis Pub/Sub channel
  const unsubscribe = runId
    ? await subscribeToRunEvents(runId, sendEvent)
    : await subscribeToGlobalEvents(sendEvent);

  // Keep-alive ping every 30 seconds to prevent network proxies/timeouts
  const pingTimer = setInterval(() => {
    reply.raw.write(': ping\n\n');
  }, 30_000);

  // Cleanup Redis subscription and timer on client disconnect
  request.raw.on('close', async () => {
    clearInterval(pingTimer);
    try {
      await unsubscribe();
    } catch (err) {
      request.log.error(err, 'Failed to unsubscribe from Redis events channel');
    }
    reply.raw.end();
  });

  // Fastify: Do not call reply.send(), we control raw socket manually.
};
