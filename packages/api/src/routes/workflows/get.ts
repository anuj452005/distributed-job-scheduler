import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { getWorkflow } from '../../services/workflow-service.js';

const paramsSchema = z.object({
  id: z.string().uuid('Invalid workflow ID format'),
});

export const getWorkflowRoute: RouteHandler = async (request, reply) => {
  const { id } = paramsSchema.parse(request.params);

  const workflow = await getWorkflow(pool, id);
  if (!workflow) {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Workflow not found',
      },
    });
  }

  return reply.status(200).send({ data: workflow });
};
