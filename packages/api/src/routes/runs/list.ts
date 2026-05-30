import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { listRuns } from '../../services/run-service.js';

const listRunsQuerySchema = z.object({
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
  workflowId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export const listRunsRoute: RouteHandler = async (request, reply) => {
  // Validate query params
  const queryResult = listRunsQuerySchema.safeParse(request.query);
  if (!queryResult.success) {
    return reply.code(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: queryResult.error.issues,
      },
    });
  }

  const { page, limit, status, workflowId, from, to } = queryResult.data;

  const result = await listRuns(pool, { page, limit, status, workflowId, from, to });

  return reply.code(200).send({
    data: {
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
};
