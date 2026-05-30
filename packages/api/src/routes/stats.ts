import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '@flowforge/db';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/stats', { preHandler: [requireAuth] }, async (request, reply) => {
    const statsRes = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM step_runs WHERE status = 'QUEUED') AS "queueDepth",
        (SELECT COUNT(DISTINCT worker_id)::int FROM step_runs WHERE status = 'RUNNING' AND worker_id IS NOT NULL) AS "activeWorkers",
        (SELECT COUNT(*)::int FROM step_runs WHERE status = 'DEAD_LETTERED') AS "dlqDepth",
        (SELECT COUNT(*)::int FROM step_runs WHERE status = 'SUCCEEDED' AND completed_at >= NOW() - INTERVAL '1 hour') AS "jobsLastHour",
        (SELECT COUNT(*)::int FROM step_runs WHERE status = 'FAILED' AND completed_at >= NOW() - INTERVAL '1 hour') AS "failedLastHour"
    `);

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
