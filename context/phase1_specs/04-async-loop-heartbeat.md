# Phase 1 — Unit 04: Async Execution Loop & Lease Heartbeat

## What This Unit Builds

Bridges the sandboxed container runner into the existing worker poll loop
(`packages/worker/src/poll-loop.ts`) so that:

1. The container run is a non-blocking async Promise — the worker's Node.js
   event loop is **not** blocked while the container is running.
2. A parallel `setInterval` heartbeat renews the PostgreSQL lease every 10
   seconds for the duration of the container run.
3. If the heartbeat detects a lost lease (0 rows updated), it fires the step's
   `AbortController` immediately to cancel the container.
4. The poll loop can claim and concurrently execute multiple steps up to the
   worker's configured `WORKER_MAX_CONCURRENCY` limit.

**Done looks like:**
- Start a container running `time.sleep(90)`. While it runs, confirm a second
  `QUEUED` step is claimed and started by the same worker process within the
  same 90-second window.
- `lease_expires_at` in the `step_runs` table advances forward every ~10
  seconds while the container is running.
- Manually set `lease_expires_at = NOW() - interval '1 second'` in the DB
  during a container run; the heartbeat detects 0 rows updated and the
  `AbortController` is fired.

---

## Dependencies

- Foundation Unit 07 — `packages/worker` poll loop, lease heartbeat, and
  graceful shutdown are implemented.
- Phase 1 Unit 03 — `python-script` handler creates and runs containers.

---

## System Boundary

Changes span **two packages**:

| Package | What changes |
|---|---|
| `packages/worker/src/poll-loop.ts` | Remove `await` blocking on handler; track concurrent Promises with a semaphore; pass `AbortController` through to heartbeat |
| `packages/worker/src/lease-heartbeat.ts` | Thread `abortController` into the heartbeat so lease loss triggers abort |

Do **not** touch `packages/handlers/` in this unit. The handler receives
`ctx.signal` — wiring the container kill to `ctx.signal.aborted` is done in
Unit 07.

---

## Files to Modify

```
packages/worker/
└── src/
    ├── poll-loop.ts           # [MODIFY] non-blocking Promise dispatch + concurrency cap
    └── lease-heartbeat.ts     # [MODIFY] fire AbortController on lease loss
```

---

## Implementation

### Non-Blocking Poll Loop

The key change: the handler execution must be started as a floating Promise that
is **not** awaited inline. Instead it is tracked in an active-jobs set. The loop
immediately continues polling for the next job.

```ts
// poll-loop.ts (conceptual delta)

const activeJobs = new Set<Promise<void>>();

while (!ctx.isShuttingDown) {
  // Enforce concurrency cap
  if (activeJobs.size >= WORKER_MAX_CONCURRENCY) {
    await sleep(POLL_INTERVAL_MS);
    continue;
  }

  const stepRun = await claimNextStep(pool, ctx.workerId, LEASE_DURATION_SECONDS);

  if (!stepRun) {
    await sleep(POLL_INTERVAL_MS);
    continue;
  }

  // Non-blocking: fire and track — do NOT await here
  const job = executeStep(stepRun, ctx).finally(() => {
    activeJobs.delete(job);
  });

  activeJobs.add(job);
  // Loop immediately to claim the next available step
}

// On shutdown — drain active jobs
await Promise.allSettled([...activeJobs]);
```

### `executeStep` (extracted function)

```ts
async function executeStep(stepRun: ClaimedStepRun, ctx: PollLoopContext): Promise<void> {
  const abortController = new AbortController();
  ctx.activeControllers.set(stepRun.id, abortController);

  const heartbeat = startLeaseHeartbeat(
    pool,
    stepRun.id,
    ctx.workerId,
    HEARTBEAT_INTERVAL_MS,
    abortController, // <-- new: abort on lease loss
  );

  try {
    const handler = handlerRegistry.get(stepRun.handler_name);
    const stepCtx: StepContext = {
      workflowRunId:  stepRun.workflow_run_id,
      stepRunId:      stepRun.id,
      attempt:        stepRun.attempt_count,
      idempotencyKey: stepRun.idempotency_key,
      signal:         abortController.signal,
      logger:         logger.child({ stepRunId: stepRun.id }),
    };

    const output = await handler(stepCtx, stepRun.input_payload);

    const rows = await commitStepSuccess(pool, stepRun.id, ctx.workerId, output);
    if (rows === 0) {
      logger.warn({ stepRunId: stepRun.id }, 'Lost lease — discarding result');
      return;
    }

    await promoteDownstreamSteps(pool, stepRun.workflow_run_id, stepRun.step_id);
    await checkAndCompleteWorkflowRun(pool, stepRun.workflow_run_id);
    await publishStepEvent({ type: 'step.succeeded', stepRunId: stepRun.id });

  } catch (err) {
    const rows = await commitStepFailure(
      pool,
      stepRun.id,
      ctx.workerId,
      err instanceof Error ? err.message : String(err),
      stepRun.retry_policy,
    );
    if (rows === 0) {
      logger.warn({ stepRunId: stepRun.id }, 'Lost lease on failure commit');
    }
  } finally {
    heartbeat.stop();
    ctx.activeControllers.delete(stepRun.id);
  }
}
```

### Lease Heartbeat — Abort on Loss

```ts
// lease-heartbeat.ts
export function startLeaseHeartbeat(
  pool: Pool,
  stepRunId: string,
  workerId: string,
  intervalMs: number,
  abortController: AbortController,    // <-- NEW parameter
): { stop: () => void } {
  const timer = setInterval(async () => {
    try {
      const rows = await refreshLease(pool, stepRunId, workerId, LEASE_DURATION_SECONDS);
      if (rows === 0) {
        logger.warn({ stepRunId }, 'Lease lost — aborting step');
        abortController.abort();
        clearInterval(timer);
      }
    } catch (err) {
      logger.error({ err, stepRunId }, 'Heartbeat DB error');
    }
  }, intervalMs);

  return { stop: () => clearInterval(timer) };
}
```

---

## Configuration

| Env Variable | Default | Notes |
|---|---|---|
| `WORKER_MAX_CONCURRENCY` | `5` | Max simultaneous step runs per worker process |
| `WORKER_HEARTBEAT_INTERVAL_SECONDS` | `10` | Heartbeat renewal frequency |
| `WORKER_LEASE_DURATION_SECONDS` | `30` | Must be > heartbeat interval |

Add `WORKER_MAX_CONCURRENCY` to `.env.example`.

---

## Verification Checklist

- [ ] Start a worker. Insert two `QUEUED` step runs. Both enter `RUNNING`
      within the same poll cycle — neither waits for the other to finish.
- [ ] `lease_expires_at` advances in the DB approximately every 10 seconds
      while a `python-script` container is running.
- [ ] Manually expire `lease_expires_at` in the DB mid-run; the heartbeat logs
      `"Lease lost — aborting step"` and calls `abortController.abort()`.
- [ ] Worker with `WORKER_MAX_CONCURRENCY=2` and 3 `QUEUED` steps: exactly 2
      reach `RUNNING` simultaneously; the third is claimed only after one
      of the first two completes.
- [ ] `SIGTERM` during container run: worker waits for active job Promises to
      settle before exiting.
- [ ] `tsc --noEmit` exits 0 across the full monorepo.
- [ ] `WORKER_MAX_CONCURRENCY` is documented in `.env.example`.
- [ ] Only `packages/worker/` files are modified.
