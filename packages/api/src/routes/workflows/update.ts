import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { updateWorkflow } from '../../services/workflow-service.js';
import { validateWorkflowDag } from '@flowforge/engine';
import { handlerRegistry } from '@flowforge/handlers';

const paramsSchema = z.object({
  id: z.string().uuid('Invalid workflow ID format'),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  steps: z.array(
    z.object({
      stepKey: z.string().min(1, 'stepKey is required'),
      handlerName: z.string().min(1, 'handlerName is required'),
      inputConfig: z.record(z.unknown()).default({}),
      retryPolicy: z.object({
        maxAttempts: z.number().int().min(1).max(10),
        baseDelayMs: z.number().int().min(100).max(60000),
      }),
      timeoutSeconds: z.number().int().min(1).max(3600),
      dependsOn: z.array(z.string()).default([]),
    })
  ).min(1, 'At least one step is required'),
});

export const updateWorkflowRoute: RouteHandler = async (request, reply) => {
  const { id } = paramsSchema.parse(request.params);
  const body = updateWorkflowSchema.parse(request.body);

  // 1. Validate DAG using engine
  const validation = validateWorkflowDag(body.steps, handlerRegistry);
  if (!validation.valid) {
    return reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Workflow definition is invalid',
        details: validation.errors,
      },
    });
  }

  // 2. Extract actor ID (set by requireAuth middleware)
  const userId = request.userId;
  if (!userId) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  // 3. Update workflow in DB
  const workflow = await updateWorkflow(pool, id, body, userId);
  if (!workflow) {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Workflow not found',
      },
    });
  }

  // 4. Insert audit log
  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
     VALUES ($1, $2, $3, $4)`,
    [userId, 'workflow.update', workflow.id, { name: workflow.name }]
  );

  return reply.status(200).send({ data: workflow });
};
