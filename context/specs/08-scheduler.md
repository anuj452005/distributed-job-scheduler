# Unit 08 — Scheduler & Lease Sweeper

## What This Unit Builds

`packages/scheduler` — two independent polling loops that run inside the
API process (MVP) or as a standalone process (V2):

1. **Retry Scheduler** — every 5 s, promote `RETRYING` step_runs whose
   `next_run_at <= NOW()` back to `QUEUED`.
2. **Lease Sweeper** — every 15 s, reclaim `RUNNING` step_runs whose
   `lease_expires_at < NOW()` from crashed workers.

**Done looks like:**
- A step in `RETRYING` state with `next_run_at` in the past is promoted
  to `QUEUED` within 5 s of the scheduler tick.
- A step stuck in `RUNNING` with an expired lease is re-queued within 15 s
  (if attempts remain) or dead-lettered (if exhausted).
- A dead-lettered step causes its parent `workflow_run` to become `FAILED`.
- The scheduler loops can be started and stopped cleanly (e.g., `scheduler.start()`,
  `scheduler.stop()`).

---

## Dependencies

- Unit 01 — Monorepo scaffold.
- Unit 03 — `@flowforge/shared` types.
- Unit 04 — `packages/db` pool.
- Unit 05 — `packages/queue`: `promoteDelayedRetries()`, `sweepExpiredLeases()`,
            `moveToDeadLetter()`.

---

## Files to Create

```
packages/scheduler/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # exports: startScheduler(), stopScheduler()
    ├── retry-scheduler.ts    # retry promotion loop
    ├── lease-sweeper.ts      # expired-lease reclaim loop
    └── scheduler-context.ts  # shared state (isRunning, timers)
```

---

## Implementation

### `retry-scheduler.ts`

```ts
export async function runRetrySchedulerTick(pool: Pool): Promise<void> {
  const promoted = await promoteDelayedRetries(pool);
  if (promoted > 0) {
    logger.info({ promoted }, 'Promoted delayed retries to QUEUED');
  }
}

export function startRetryScheduler(pool: Pool, intervalMs: number): NodeJS.Timer {
  return setInterval(async () => {
    try {
      await runRetrySchedulerTick(pool);
    } catch (err) {
      logger.error({ err }, 'Retry scheduler tick failed');
    }
  }, intervalMs);
}
```

### `lease-sweeper.ts`

```ts
export async function runLeaseSweeperTick(pool: Pool): Promise<void> {
  const { requeued, deadLettered } = await sweepExpiredLeases(pool);

  if (requeued.length > 0) {
    logger.info({ count: requeued.length, ids: requeued }, 'Re-queued steps from crashed workers');
  }

  if (deadLettered.length > 0) {
    logger.warn({ count: deadLettered.length, ids: deadLettered }, 'Dead-lettered exhausted steps');

    // For each dead-lettered step_run, find its workflow_run_id and mark it FAILED
    for (const stepRunId of deadLettered) {
      const workflowRunId = await getWorkflowRunIdForStep(pool, stepRunId);
      if (workflowRunId) {
        await moveToDeadLetter(pool, workflowRunId);
      }
    }
  }
}

export function startLeaseSweeper(pool: Pool, intervalMs: number): NodeJS.Timer {
  return setInterval(async () => {
    try {
      await runLeaseSweeperTick(pool);
    } catch (err) {
      logger.error({ err }, 'Lease sweeper tick failed');
    }
  }, intervalMs);
}
```

### `index.ts`

```ts
export function startScheduler(pool: Pool): SchedulerHandle {
  const retryTimer = startRetryScheduler(pool, SCHEDULER_POLL_INTERVAL_MS);
  const sweeperTimer = startLeaseSweeper(pool, SWEEPER_POLL_INTERVAL_MS);

  return {
    stop() {
      clearInterval(retryTimer);
      clearInterval(sweeperTimer);
    },
  };
}
```

---

## Configuration (from environment)

| Env Variable | Default | Notes |
|---|---|---|
| `SCHEDULER_POLL_INTERVAL_MS` | `5000` | Retry promotion frequency |
| `SWEEPER_POLL_INTERVAL_MS` | `15000` | Lease sweeper frequency |

---

## Key Rules (from `architecture.md` Invariants)

- The Scheduler must **not** execute any handler function. It only changes `step_runs.status`.
- The Lease Sweeper must **not** execute any handler function.
- Neither the Scheduler nor the Sweeper may import from `packages/handlers` or `packages/worker`.

---

## End-to-End Crash Recovery Test

This is the verification for success criterion #5 in `project-overview.md`.

1. Insert a `step_run` in `RUNNING` state with `lease_expires_at = NOW() - 1 second`
   and `attempt_count = 1` and `max_attempts = 3`.
2. Wait one sweeper tick (up to 15 s).
3. Assert the row is now `QUEUED` with `worker_id = NULL` and `lease_expires_at = NULL`.
4. Repeat with `attempt_count = 3`, `max_attempts = 3`.
5. Assert the row is now `DEAD_LETTERED` and the parent `workflow_run` is `FAILED`.

---

## Verification Checklist

- [ ] `startScheduler()` returns a handle with a `stop()` method.
- [ ] After `stop()`, no more ticks run (no more DB queries from scheduler).
- [ ] Retry promotion: `RETRYING` row with `next_run_at <= NOW()` → `QUEUED` within 5 s.
- [ ] Retry promotion: `RETRYING` row with `next_run_at` in the future → NOT promoted.
- [ ] Lease sweeper: `RUNNING` row with expired lease and remaining attempts → `QUEUED`
      within 15 s.
- [ ] Lease sweeper: `RUNNING` row with expired lease and no remaining attempts →
      `DEAD_LETTERED` and parent `workflow_run` → `FAILED` within 15 s.
- [ ] Scheduler and Sweeper do not import from `packages/handlers` or `packages/worker`.
- [ ] `tsc --noEmit` exits 0 on `packages/scheduler`.
