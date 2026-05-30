import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { eventStreamRoute } from './stream.js';

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // GET /events/stream — SSE Gateway stream protected by authentication
  app.get('/events/stream', { preHandler: [requireAuth] }, eventStreamRoute);
}
