# Unit 07 — Worker Process

## What This Unit Builds

`packages/worker` — the Node.js worker process that polls the queue,
claims steps atomically, executes handlers, commits results with the
fencing-token query, and shuts down gracefully on `SIGTERM`.

This is the heart of FlowForge. Every architectural invariant in
`architecture.md` directly constrains this package.

**Done looks like:**
- Start one worker process. Manually insert a `QUEUED` `step_run` row
  with `handler_name = 'http-request'` and a valid input payload.
- The worker claims the row, executes the `http-request` handler, and
  the row becomes `SUCCEEDED` with `output_payload` filled in.
- Start two workers against the same `QUEUED` row. Exactly one worker
  claims it; the other finds nothing to claim.
- Kill the worker process with `SIGTERM` mid-execution. The worker
  finishes its current handler (or waits up to 30 s), then exits cleanly.

---

## Dependencies

- Unit 01 — Monorepo scaffold.
- Unit 03 — `@flowforge/shared` types.
- Unit 04 — `packages/db` pool.
- Unit 05 — `packages/queue` claim, commit, heartbeat, promote functions.
- Unit 06 — `packages/handlers` registry and `registerAllHandlers()`.

---

## Files to Create

```
packages/worker/
├── package.json
├── tsconfig.json
├── Dockerfile                     # production image
└── src/
    ├── index.ts                   # entry point: starts the poll loop
    ├── worker.ts                  # WorkerProcess class
    ├── poll-loop.ts               # main polling logic
    ├── lease-heartbeat.ts         # lease renewal timer
    ├── graceful-shutdown.ts       # SIGTERM handler
    └── worker-id.ts               # generates a stable worker ID
```

---

## Key Implementation

### Worker ID

```ts
// worker-id.ts
import { randomUUID } from 'crypto';
import * as os from 'os';

export function generateWorkerId(): string {
  return `worker-${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
}
```

### Poll Loop (`poll-loop.ts`)

```ts
// Pseudo-code — implement in TypeScript with full types
async function pollLoop(ctx: PollLoopContext): Promise<void> {
  while (!ctx.isShuttingDown) {
    const stepRun = await claimNextStep(pool, ctx.workerId, LEASE_DURATION_SECONDS);

    if (!stepRun) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    // Start lease heartbeat
    const heartbeat = startLeaseHeartbeat(stepRun.id, ctx.workerId);

    try {
      // Check idempotency before executing
      // (skip if already succeeded — handled by SUCCEEDED check on claim query)

      // Get abort controller for this step
      const abortController = new AbortController();
      ctx.activeControllers.set(stepRun.id, abortController);

      // Dispatch to handler
      const handler = handlerRegistry.get(stepRun.handler_name);  // from step join
      const output = await handler(
        {
          workflowRunId:  stepRun.workflow_run_id,
          stepRunId:      stepRun.id,
          attempt:        stepRun.attempt_count,
          idempotencyKey: stepRun.idempotency_key,
          signal:         abortController.signal,
          logger:         logger.child({ stepRunId: stepRun.id }),
        },
        stepRun.input_payload,
      );

      // Commit success with fencing token
      const rowsUpdated = await commitStepSuccess(pool, stepRun.id, ctx.workerId, output);

      if (rowsUpdated === 0) {
        // Lost lease — discard result, do NOT promote downstream
        logger.warn({ stepRunId: stepRun.id }, 'Lost lease on step commit — discarding result');
        continue;
      }

      // Promote downstream steps
      await promoteDownstreamSteps(pool, stepRun.workflow_run_id, stepRun.step_id);

      // Check if entire workflow is now complete
      await checkAndCompleteWorkflowRun(pool, stepRun.workflow_run_id);

      // Publish SSE event (fire-and-forget — Unit 09 wires this)
      // publishStepEvent({ type: 'step.succeeded', ... });

    } catch (err) {
      const rowsUpdated = await commitStepFailure(
        pool,
        stepRun.id,
        ctx.workerId,
        err instanceof Error ? err.message : String(err),
        stepRun.retry_policy,
      );

      if (rowsUpdated === 0) {
        logger.warn({ stepRunId: stepRun.id }, 'Lost lease on step failure commit');
      }

    } finally {
      heartbeat.stop();
      ctx.activeControllers.delete(stepRun.id);
    }
  }
}
```

### Lease Heartbeat (`lease-heartbeat.ts`)

```ts
function startLeaseHeartbeat(stepRunId: string, workerId: string) {
  const timer = setInterval(async () => {
    const rows = await refreshLease(pool, stepRunId, workerId, LEASE_DURATION_SECONDS);
    if (rows === 0) {
      // Lease lost — signal abort to the handler
      abortController.abort();
    }
  }, HEARTBEAT_INTERVAL_MS); // every 10 s

  return { stop: () => clearInterval(timer) };
}
```

### Graceful Shutdown (`graceful-shutdown.ts`)

```ts
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down worker');
  ctx.isShuttingDown = true;

  // Signal all active handlers to cancel
  for (const controller of ctx.activeControllers.values()) {
    controller.abort();
  }

  // Wait up to 30s for active handlers to finish
  const deadline = Date.now() + 30_000;
  while (ctx.activeControllers.size > 0 && Date.now() < deadline) {
    await sleep(500);
  }

  await pool.end();
  process.exit(0);
});
```

---

## Configuration (from environment)

| Env Variable | Default | Notes |
|---|---|---|
| `WORKER_POLL_INTERVAL_MS` | `500` | How often to poll when queue is empty |
| `WORKER_LEASE_DURATION_SECONDS` | `30` | Lease length — must be > heartbeat interval |
| `WORKER_HEARTBEAT_INTERVAL_SECONDS` | `10` | Heartbeat renewal frequency |
| `DATABASE_URL` | required | Postgres connection string |

---

## Fencing-Token Invariant Reminder

The commit queries (`commitStepSuccess`, `commitStepFailure`) are defined in
`packages/queue`. **Do not** write an UPDATE to `step_runs` directly in
`packages/worker`. Always call the queue functions and check `rowsUpdated`.

---

## Verification Checklist

- [ ] Worker starts and logs its `workerId` on startup.
- [ ] Insert a `QUEUED` `step_run` with `handler_name = 'http-request'` and
      valid input → worker claims it, row becomes `RUNNING` → row becomes `SUCCEEDED`
      with `output_payload` populated.
- [ ] Two workers running against the same `QUEUED` row: exactly one claims it
      (`RUNNING`), the other finds nothing. Verified by checking `worker_id` in the DB.
- [ ] `SIGTERM` mid-execution: worker waits for current handler, then exits with code 0.
- [ ] Fencing test: manually expire `lease_expires_at` in the DB while a slow handler
      is running. The commit returns `rowCount = 0`. Worker logs a warning and moves on.
- [ ] Handler that throws an error: row becomes `RETRYING` with a future `next_run_at`.
- [ ] Handler that exhausts retries: row becomes `DEAD_LETTERED`.
- [ ] Worker never calls `process.exit()` mid-handler (only in SIGTERM shutdown).
- [ ] `tsc --noEmit` exits 0 on `packages/worker`.
- [ ] Worker does not import from `packages/api` or `packages/engine`.
