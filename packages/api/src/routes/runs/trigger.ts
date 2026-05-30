import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import {
  triggerRun,
  WorkflowNotFoundError,
  WorkflowEmptyError,
} from '../../services/run-service.js';

const triggerRunBodySchema = z.object({
  inputPayload: z.record(z.unknown()).optional().default({}),
});

const triggerRunParamsSchema = z.object({
  id: z.string().uuid('Workflow ID must be a valid UUID'),
});

export const triggerRunRoute: RouteHandler = async (request, reply) => {
  // 1. Validate params
  const paramsResult = triggerRunParamsSchema.safeParse(request.params);
  if (!paramsResult.success) {
    return reply.code(404).send({
      error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
    });
  }

  // 2. Validate body
  const bodyResult = triggerRunBodySchema.safeParse(request.body);
  if (!bodyResult.success) {
    return reply.code(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'inputPayload must be a JSON object',
        details: bodyResult.error.issues,
      },
    });
  }

  // 3. Verify actor identity
  const userId = request.userId;
  if (!userId) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  // 4. Trigger run via service
  try {
    const runDto = await triggerRun(
      pool,
      paramsResult.data.id,
      bodyResult.data.inputPayload,
      userId
    );
    return reply.code(202).send({ data: runDto });
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) {
      return reply.code(404).send({
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }
    if (err instanceof WorkflowEmptyError) {
      return reply.code(422).send({
        error: { code: 'WORKFLOW_EMPTY', message: 'Workflow has no steps' },
      });
    }
    throw err;
  }
};
