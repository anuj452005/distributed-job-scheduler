# Unit 03 — Non-Blocking Cron Scheduler

> **Phase**: Phase 0 — Trigger Subsystem  
> **System Boundary**: `packages/scheduler/` (extend existing package)  
> **Depends On**: Unit 01 (trigger schema), Unit 02 (`@flowforge/trigger`), `cron-parser` npm package

---

## What This Unit Builds

Adds a `runCronSchedulerTick` function to the existing `@flowforge/scheduler` package that:

1. **Phase 1 (Transactional)** — Claims all due cron triggers using `FOR UPDATE SKIP LOCKED`, advances each trigger's `next_fire_at` and `last_fired_at`, then commits immediately.
2. **Phase 2 (Non-Transactional)** — Outside all locks, calls `triggerWorkflow` for each claimed trigger, applying the configured misfire policy.

Wires this tick into the existing scheduler start loop alongside the retry-promoter and lease-sweeper.

**Visible result**: Starting the API server with at least one `ACTIVE` cron trigger in the DB causes `workflow_runs` rows to appear on schedule. The scheduler logs each claimed trigger.

---

## New Dependency

Install `cron-parser` in the `packages/scheduler` package:

```bash
npm install cron-parser --workspace=packages/scheduler
```

Type definitions are bundled with the package (`"types"` field in its `package.json`), no separate `@types/cron-parser` needed.

---

## Files To Create / Modify

### [NEW] `packages/scheduler/src/cron-scheduler.ts`

```typescript
import type { Pool } from 'pg';
import parser from 'cron-parser';
import { triggerWorkflow } from '@flowforge/trigger';

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
      const nextFire = parser
        .parseExpression(row.config.cron)
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
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // ── Phase 2: Dispatch workflow runs (non-transactional) ─────────────────
  for (const trigger of claimed) {
    const policy = trigger.config.misfire_policy ?? 'SKIP';
    const fireTimes = resolveMisfireTimes(trigger.lastScheduledAt, trigger.config.cron, policy);

    for (const scheduledTime of fireTimes) {
      // Fire-and-forget error handling: a single trigger failure
      // must not stop remaining triggers from being dispatched.
      try {
        await triggerWorkflow(pool, {
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          payload: { scheduled_time: scheduledTime.toISOString() },
          sourceType: 'cron',
          userId: 'system:cron',
          // No idempotencyKey for cron — each fire always creates a new run.
        });
      } catch (err) {
        // Log and continue; failure is recorded in workflow_trigger_executions.
        console.error(`[cron-scheduler] Failed to dispatch trigger ${trigger.id}:`, err);
      }
    }
  }
}

/**
 * Resolve which timestamps to fire based on the misfire policy.
 *
 * SKIP     → Fire once at current time. Skips any missed fires.
 * RUN_ONCE → Fire once using the most recent missed scheduled time.
 * CATCH_UP → Fire once for every missed scheduled time (back-fill).
 */
function resolveMisfireTimes(
  lastScheduled: Date,
  cronExpr: string,
  policy: 'SKIP' | 'RUN_ONCE' | 'CATCH_UP'
): Date[] {
  if (policy === 'SKIP') {
    return [new Date()];
  }

  const now = new Date();
  const interval = parser.parseExpression(cronExpr, { currentDate: lastScheduled });
  const missed: Date[] = [];

  try {
    let next = interval.next().toDate();
    while (next <= now) {
      missed.push(next);
      next = interval.next().toDate();
    }
  } catch {
    // parseExpression iterator exhausted (shouldn't happen for standard crons)
  }

  if (missed.length === 0) return [now];
  if (policy === 'RUN_ONCE') return [missed[missed.length - 1]];
  return missed; // CATCH_UP: fire all missed times
}
```

### [MODIFY] `packages/scheduler/src/index.ts`

Wire the cron tick into the existing scheduler start/stop loop. Add alongside the existing `retryScheduler` and `leaseSweeper` timers:

```typescript
// Existing imports ...
import { runCronSchedulerTick } from './cron-scheduler.js';

// Inside startScheduler():
const cronTickInterval = setInterval(async () => {
  try {
    await runCronSchedulerTick(pool);
  } catch (err) {
    logger.error({ err }, '[scheduler] cron tick error');
  }
}, 10_000); // Poll every 10 seconds

ctx.addInterval(cronTickInterval);
```

> Adjust the poll interval constant to match the project's existing scheduler interval convention (check `scheduler-context.ts`).

---

## Misfire Policy Reference

| Policy | Behavior | When to Use |
|---|---|---|
| `SKIP` | Always fires once at current time, discards missed fires | Most cron jobs — "run now or never" |
| `RUN_ONCE` | Fires once for the most recently missed scheduled time | Idempotent jobs that must run exactly once per period |
| `CATCH_UP` | Fires once per missed scheduled time (back-fill) | Audit/billing jobs where every tick must be executed |

---

## Design Decisions

### Why Two Phases (Transactional + Non-Transactional)?

If `triggerWorkflow` (which calls `createWorkflowRun`) were inside the `BEGIN/COMMIT` block, the PostgreSQL row lock on `workflow_triggers` would be held for the duration of the engine call. That engine call creates multiple DB rows sequentially. Under load, this would:
- Block other scheduler instances from claiming triggers for the full engine duration.
- Increase lock contention on the `workflow_triggers` table.

Committing the advance (Phase 1) immediately drops the lock in O(1). Phase 2 runs entirely unlocked.

### Why `SKIP LOCKED` Instead of Advisory Locks?

`SKIP LOCKED` operates at the row level — each trigger row is a natural lock unit. Advisory locks require separate coordination logic to map lock IDs to trigger IDs. `SKIP LOCKED` is simpler, safer, and already used everywhere in FlowForge's queue layer.

### Why `userId: 'system:cron'`?

Cron fires have no human actor. Using a sentinel string `'system:cron'` instead of `null` or `''`:
- Avoids `NOT NULL` constraint violations on `workflow_runs.created_by` (if that column exists).
- Makes audit log entries searchable by non-human actor.
- Is consistent with the pattern used in the lease sweeper (`'system:sweeper'`).

---

## Verification Checklist

- [ ] `cron-parser` appears in `packages/scheduler/package.json` dependencies
- [ ] `tsc --noEmit` from `packages/scheduler/` exits 0
- [ ] `tsc --noEmit` from monorepo root exits 0
- [ ] Insert one `ACTIVE` cron trigger with `config = { "cron": "* * * * *", "misfire_policy": "SKIP" }` and `next_fire_at = NOW() - INTERVAL '1 minute'`
- [ ] Start the API server — within 10 seconds a new `workflow_runs` row appears
- [ ] The trigger's `next_fire_at` advances to the next future cron time
- [ ] The trigger's `last_fired_at` is updated to approximately NOW()
- [ ] A `workflow_trigger_executions` row is created with `status = 'SUCCEEDED'`
- [ ] Insert a second trigger with `misfire_policy = 'CATCH_UP'` and `next_fire_at = NOW() - INTERVAL '3 minutes'` — verify multiple `workflow_runs` rows are created (one per missed tick)
- [ ] `runCronSchedulerTick` called concurrently twice does not double-fire any trigger (`SKIP LOCKED` test)
