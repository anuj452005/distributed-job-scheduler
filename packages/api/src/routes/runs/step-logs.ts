import type { RouteHandler } from 'fastify';
import { z } from 'zod';
import { pool } from '@flowforge/db';

const logsParamsSchema = z.object({
  id: z.string().uuid('Step Run ID must be a valid UUID'),
});

export const getStepLogsRoute: RouteHandler = async (request, reply) => {
  const paramsResult = logsParamsSchema.safeParse(request.params);
  if (!paramsResult.success) {
    return reply.code(404).send({
      error: { code: 'STEP_RUN_NOT_FOUND', message: 'Step run not found' },
    });
  }

  const stepRunId = paramsResult.data.id;

  const stepRunRes = await pool.query(
    `SELECT id FROM step_runs WHERE id = $1`,
    [stepRunId]
  );
  if (stepRunRes.rows.length === 0) {
    return reply.code(404).send({
      error: { code: 'STEP_RUN_NOT_FOUND', message: 'Step run not found' },
    });
  }

  const logsRes = await pool.query(
    `SELECT id, level, message, metadata, created_at
     FROM step_logs
     WHERE step_run_id = $1
     ORDER BY created_at ASC`,
    [stepRunId]
  );

  const logs = logsRes.rows.map((row) => ({
    id: row.id,
    level: row.level,
    message: row.message,
    metadata: row.metadata,
    createdAt: (row.created_at as Date).toISOString(),
  }));

  return reply.status(200).send({
    data: logs,
  });
};
