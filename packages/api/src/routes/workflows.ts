import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role-guard.js';

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/workflows
  app.get('/workflows', { preHandler: [requireAuth] }, async (request, reply) => {
    return { data: [] };
  });

  // POST /api/workflows
  app.post('/workflows', { preHandler: [requireAuth, requireRole('operator')] }, async (request, reply) => {
    return { data: { success: true } };
  });

  // Test error route registered for verification
  if (process.env.NODE_ENV === 'test') {
    app.get('/test-error', async () => {
      throw new Error('Database connection failed! Stack: at pg.connect line 42...');
    });
  }
}
