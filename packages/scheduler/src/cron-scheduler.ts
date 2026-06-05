import type { Pool } from 'pg';
import { CronExpressionParser } from 'cron-parser';
import { triggerWorkflow } from '@flowforge/trigger';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'cron-scheduler',
});

interface ClaimedCronTrigger {
  id: string;
  workflowId: string;
  /** The next_fire_at value *before* we advanced it — used for misfire calculation. */
  lastScheduledAt: Date;
  config: {
    cron: string;
    misfire_policy?: 'SKIP' | 'RUN_ONCE' | 'CATCH_UP';
  };
}

/**
 * One scheduler tick for cron triggers.
 *
 * Phase 1 (transactional, fast):
 *   - SELECT due ACTIVE cron triggers FOR UPDATE SKIP LOCKED.
 *   - Advance next_fire_at + last_fired_at for each claimed trigger.
 *   - If parsing the cron expression fails, update the status to DISABLED.
 *   - COMMIT immediately to release locks.
 *
 * Phase 2 (non-transactional, outside locks):
 *   - For each claimed trigger, apply misfire policy and call triggerWorkflow.
 *
 * Safe to call concurrently from multiple API/scheduler process instances —
 * SKIP LOCKED ensures only one process claims each trigger per tick.
 */
export async function runCronSchedulerTick(pool: Pool): Promise<void> {
  const claimed: ClaimedCronTrigger[] = [];

  // ── Phase 1: Claim and advance (transactional) ──────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dueRes = await client.query<{
      id: string;
      workflow_id: string;
      config: ClaimedCronTrigger['config'];
      next_fire_at: Date;
    }>(
      `SELECT id, workflow_id, config, next_fire_at
       FROM workflow_triggers
       WHERE status = 'ACTIVE'
         AND type = 'cron'
         AND next_fire_at <= NOW()
       ORDER BY next_fire_at ASC
       FOR UPDATE SKIP LOCKED`
    );

    for (const row of dueRes.rows) {
      try {
        const nextFire = CronExpressionParser
          .parse(row.config.cron)
          .next()
          .toDate();

        await client.query(
          `UPDATE workflow_triggers
           SET next_fire_at = $1,
               last_fired_at = NOW(),
               updated_at = NOW()
           WHERE id = $2`,
          [nextFire, row.id]
        );

        claimed.push({
          id: row.id,
          workflowId: row.workflow_id,
          lastScheduledAt: row.next_fire_at,
          config: row.config,
        });
      } catch (parseErr) {
        logger.error(
          { err: parseErr, triggerId: row.id, config: row.config },
          'Failed to parse cron expression; disabling trigger'
        );

        await client.query(
          `UPDATE workflow_triggers
           SET status = 'DISABLED',
               updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // ── Phase 2: Dispatch workflow runs (non-transactional) ─────────────────
  if (claimed.length > 0) {
    logger.info({ count: claimed.length }, 'Claimed due cron triggers');
  }

  for (const trigger of claimed) {
    const policy = trigger.config.misfire_policy ?? 'SKIP';
    const fireTimes = resolveMisfireTimes(trigger.lastScheduledAt, trigger.config.cron, policy);

    for (const scheduledTime of fireTimes) {
      try {
        await triggerWorkflow(pool, {
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          payload: { scheduled_time: scheduledTime.toISOString() },
          sourceType: 'cron',
          userId: 'system:cron',
        });
      } catch (err) {
        logger.error(
          { err, triggerId: trigger.id, scheduledTime },
          'Failed to dispatch cron workflow trigger'
        );
      }
    }
  }
}

/**
 * Resolve which timestamps to fire based on the misfire policy.
 *
 * SKIP     → Fire once at lastScheduledAt time (ignores missed fires).
 * RUN_ONCE → Fire once using the most recent missed scheduled time.
 * CATCH_UP → Fire once for every missed scheduled time (back-fill).
 */
export function resolveMisfireTimes(
  lastScheduled: Date,
  cronExpr: string,
  policy: 'SKIP' | 'RUN_ONCE' | 'CATCH_UP',
  now: Date = new Date()
): Date[] {
  if (policy === 'SKIP') {
    return [lastScheduled];
  }

  const interval = CronExpressionParser.parse(cronExpr, { currentDate: lastScheduled });
  const missed: Date[] = [];

  try {
    let next = interval.next().toDate();
    while (next <= now) {
      missed.push(next);
      next = interval.next().toDate();
    }
  } catch {
    // parseExpression iterator exhausted
  }

  if (missed.length === 0) {
    return [lastScheduled];
  }

  if (policy === 'RUN_ONCE') {
    return [missed[missed.length - 1]];
  }

  return missed; // CATCH_UP: fire all missed times
}

/**
 * Start cron scheduler loop.
 */
export function startCronScheduler(pool: Pool, intervalMs: number): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await runCronSchedulerTick(pool);
    } catch (err) {
      logger.error({ err }, 'Cron scheduler tick failed');
    }
  }, intervalMs);
}
