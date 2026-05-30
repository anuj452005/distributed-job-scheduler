import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role-guard.js';
import { triggerRunRoute } from './trigger.js';
import { getRunRoute } from './get.js';
import { listRunsRoute } from './list.js';
import { listRunsByWorkflowRoute } from './list-by-workflow.js';
import { retryStepRoute } from './retry-step.js';
import { replayRoute } from './replay.js';
import { cancelRoute } from './cancel.js';

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

  // POST /steps/:id/retry — operator only, retry a single step
  app.post(
    '/steps/:id/retry',
    { preHandler: [requireAuth, requireRole('operator')] },
    retryStepRoute
  );

  // POST /runs/:id/replay — operator only, replay a failed workflow run from a step
  app.post(
    '/runs/:id/replay',
    { preHandler: [requireAuth, requireRole('operator')] },
    replayRoute
  );

  // POST /runs/:id/cancel — operator only, cancel an active workflow run
  app.post(
    '/runs/:id/cancel',
    { preHandler: [requireAuth, requireRole('operator')] },
    cancelRoute
  );
}
