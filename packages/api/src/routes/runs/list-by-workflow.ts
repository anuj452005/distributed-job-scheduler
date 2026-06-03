import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { listRunsByWorkflow } from '../../services/run-service.js';

const listByWorkflowParamsSchema = z.object({
  id: z.string().uuid('Workflow ID must be a valid UUID'),
});

const listByWorkflowQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform(v => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform(v => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
  status: z.string().optional(),
});

export const listRunsByWorkflowRoute: RouteHandler = async (request, reply) => {
  // 1. Validate params
  const paramsResult = listByWorkflowParamsSchema.safeParse(request.params);
  if (!paramsResult.success) {
    return reply.code(404).send({
      error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
    });
  }

  // 2. Validate query
  const queryResult = listByWorkflowQuerySchema.safeParse(request.query);
  if (!queryResult.success) {
    return reply.code(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: queryResult.error.issues,
      },
    });
  }

  const userId = request.userId;
  if (!userId) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const { page, limit, status } = queryResult.data;
  const result = await listRunsByWorkflow(
    pool,
    paramsResult.data.id,
    { page, limit, status },
    userId
  );

  return reply.code(200).send({
    data: {
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
};
