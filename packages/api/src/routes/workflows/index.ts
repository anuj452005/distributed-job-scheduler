import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role-guard.js';
import { createWorkflowRoute } from './create.js';
import { listWorkflowsRoute } from './list.js';
import { getWorkflowRoute } from './get.js';
import { updateWorkflowRoute } from './update.js';
import { deleteWorkflowRoute } from './delete.js';

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  // GET /workflows
  app.get('/workflows', { preHandler: [requireAuth] }, listWorkflowsRoute);

  // GET /workflows/:id
  app.get('/workflows/:id', { preHandler: [requireAuth] }, getWorkflowRoute);

  // POST /workflows
  app.post('/workflows', { preHandler: [requireAuth, requireRole('operator')] }, createWorkflowRoute);

  // PUT /workflows/:id
  app.put('/workflows/:id', { preHandler: [requireAuth, requireRole('operator')] }, updateWorkflowRoute);

  // DELETE /workflows/:id
  app.delete('/workflows/:id', { preHandler: [requireAuth, requireRole('operator')] }, deleteWorkflowRoute);

  // Test error route registered for verification
  if (process.env.NODE_ENV === 'test') {
    app.get('/test-error', async () => {
      throw new Error('Database connection failed! Stack: at pg.connect line 42...');
    });
  }
}
