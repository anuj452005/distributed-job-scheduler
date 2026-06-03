import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '@flowforge/db';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/stats', { preHandler: [requireAuth] }, async (request, reply) => {
    const statsRes = await pool.query(`
      SELECT
        (
          SELECT COUNT(*)::int 
          FROM step_runs sr
          JOIN workflow_runs wr ON sr.workflow_run_id = wr.id
          JOIN workflows w ON wr.workflow_id = w.id
          WHERE sr.status = 'QUEUED' AND w.created_by = $1
        ) AS "queueDepth",
        (
          SELECT COUNT(DISTINCT sr.worker_id)::int 
          FROM step_runs sr
          JOIN workflow_runs wr ON sr.workflow_run_id = wr.id
          JOIN workflows w ON wr.workflow_id = w.id
          WHERE sr.status = 'RUNNING' AND sr.worker_id IS NOT NULL AND w.created_by = $1
        ) AS "activeWorkers",
        (
          SELECT COUNT(*)::int 
          FROM step_runs sr
          JOIN workflow_runs wr ON sr.workflow_run_id = wr.id
          JOIN workflows w ON wr.workflow_id = w.id
          WHERE sr.status = 'DEAD_LETTERED' AND w.created_by = $1
        ) AS "dlqDepth",
        (
          SELECT COUNT(*)::int 
          FROM step_runs sr
          JOIN workflow_runs wr ON sr.workflow_run_id = wr.id
          JOIN workflows w ON wr.workflow_id = w.id
          WHERE sr.status = 'SUCCEEDED' AND sr.completed_at >= NOW() - INTERVAL '1 hour' AND w.created_by = $1
        ) AS "jobsLastHour",
        (
          SELECT COUNT(*)::int 
          FROM step_runs sr
          JOIN workflow_runs wr ON sr.workflow_run_id = wr.id
          JOIN workflows w ON wr.workflow_id = w.id
          WHERE sr.status = 'FAILED' AND sr.completed_at >= NOW() - INTERVAL '1 hour' AND w.created_by = $1
        ) AS "failedLastHour"
    `, [request.userId]);

    const { queueDepth, activeWorkers, dlqDepth, jobsLastHour, failedLastHour } = statsRes.rows[0];
    const total = jobsLastHour + failedLastHour;
    const failureRate = total > 0 ? failedLastHour / total : 0.0;

    return reply.status(200).send({
      data: {
        queueDepth,
        activeWorkers,
        dlqDepth,
        jobsLastHour,
        failureRate,
      },
    });
  });
}
