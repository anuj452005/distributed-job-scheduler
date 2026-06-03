import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';
import { deleteWorkflow, WorkflowConflictError } from '../../services/workflow-service.js';

const paramsSchema = z.object({
  id: z.string().uuid('Invalid workflow ID format'),
});

export const deleteWorkflowRoute: RouteHandler = async (request, reply) => {
  const { id } = paramsSchema.parse(request.params);

  // 1. Extract actor ID (set by requireAuth middleware)
  const userId = request.userId;
  if (!userId) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  try {
    // 2. Delete workflow
    const deleted = await deleteWorkflow(pool, id, userId);
    if (!deleted) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Workflow not found',
        },
      });
    }

    // 3. Insert audit log
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [userId, 'workflow.delete', id, {}]
    );

    return reply.status(204).send();
  } catch (err) {
    if (err instanceof WorkflowConflictError) {
      return reply.status(409).send({
        error: {
          code: 'CONFLICT',
          message: err.message,
        },
      });
    }
    throw err;
  }
};
