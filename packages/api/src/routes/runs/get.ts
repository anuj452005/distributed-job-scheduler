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

  // 2. Fetch run detail
  const runDetail = await getRunDetail(pool, paramsResult.data.id);
  if (!runDetail) {
    return reply.code(404).send({
      error: { code: 'RUN_NOT_FOUND', message: 'Run not found' },
    });
  }

  return reply.code(200).send({ data: runDetail });
};
