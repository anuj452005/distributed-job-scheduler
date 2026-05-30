import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { createWorkflow } from '../../services/workflow-service.js';
import { validateWorkflowDag } from '@flowforge/engine';
import { handlerRegistry } from '@flowforge/handlers';

const createWorkflowSchema = z.object({
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

export const createWorkflowRoute: RouteHandler = async (request, reply) => {
  // 1. Validate request body with Zod
  const body = createWorkflowSchema.parse(request.body);

  // 2. Validate DAG using engine
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

  // 3. Extract actor ID (set by requireAuth middleware)
  const userId = request.userId;
  if (!userId) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  // 4. Create workflow in DB
  const workflow = await createWorkflow(pool, body, userId);

  // 5. Insert audit log
  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
     VALUES ($1, $2, $3, $4)`,
    [userId, 'workflow.create', workflow.id, { name: workflow.name }]
  );

  return reply.status(201).send({ data: workflow });
};
