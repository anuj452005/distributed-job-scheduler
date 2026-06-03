import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { listWorkflows } from '../../services/workflow-service.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export const listWorkflowsRoute: RouteHandler = async (request, reply) => {
  const { page, limit, search } = listQuerySchema.parse(request.query);

  const userId = request.userId;
  if (!userId) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const result = await listWorkflows(pool, { page, limit, search, userId });

  return reply.status(200).send({
    data: {
      items: result.items,
      total: result.total,
      page,
      limit,
    },
  });
};
