import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { getRunDetail } from '../../services/run-service.js';

const getRunParamsSchema = z.object({
  id: z.string().uuid('Run ID must be a valid UUID'),
});

export const getRunRoute: RouteHandler = async (request, reply) => {
  // 1. Validate params
  const paramsResult = getRunParamsSchema.safeParse(request.params);
  if (!paramsResult.success) {
    return reply.code(404).send({
      error: { code: 'RUN_NOT_FOUND', message: 'Run not found' },
    });
  }

  const userId = request.userId;
  if (!userId) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  // 2. Fetch run detail
  const runDetail = await getRunDetail(pool, paramsResult.data.id, userId);
  if (!runDetail) {
    return reply.code(404).send({
      error: { code: 'RUN_NOT_FOUND', message: 'Run not found' },
    });
  }

  return reply.code(200).send({ data: runDetail });
};
