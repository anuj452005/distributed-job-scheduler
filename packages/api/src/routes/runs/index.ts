import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role-guard.js';
import { triggerRunRoute } from './trigger.js';
import { getRunRoute } from './get.js';
import { listRunsRoute } from './list.js';
import { listRunsByWorkflowRoute } from './list-by-workflow.js';

export async function runRoutes(app: FastifyInstance): Promise<void> {
  // POST /workflows/:id/runs — operator only, triggers a new run
  app.post(
    '/workflows/:id/runs',
    { preHandler: [requireAuth, requireRole('operator')] },
    triggerRunRoute
  );

  // GET /runs — any authenticated role, paginated list with filters
  app.get('/runs', { preHandler: [requireAuth] }, listRunsRoute);

  // GET /runs/:id — any authenticated role, full run detail
  app.get('/runs/:id', { preHandler: [requireAuth] }, getRunRoute);

  // GET /workflows/:id/runs — any authenticated role, runs scoped to a workflow
  app.get(
    '/workflows/:id/runs',
    { preHandler: [requireAuth] },
    listRunsByWorkflowRoute
  );
}
