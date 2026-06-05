# Phase 1 — Unit 07: Cooperative Container Abort

## What This Unit Builds

Wires the `ctx.signal` (`AbortSignal`) received by the handler into the running
Docker container's lifecycle. When the signal fires (either because the operator
cancelled the workflow run or the lease heartbeat detected a lost lease):

1. `container.kill()` is called immediately, terminating the container process.
2. `container.remove()` is called to clean up Docker resources.
3. The workspace temporary directory is deleted.
4. The step is committed with `status = CANCELLED` if the operator cancelled,
   or left for the lease sweeper if the lease was lost.

**Done looks like:**
- A container running `time.sleep(300)` is killed within 2 seconds of the
  operator clicking "Cancel" in the dashboard (Success Criterion 8).
- After the kill, `docker ps -a` shows no dangling container for that step run.
- The workspace directory `/tmp/flowforge/run_{stepRunId}/` is deleted.
- `step_runs.status` transitions to `CANCELLED` in PostgreSQL.

---

## Dependencies

- Foundation Unit 10 — `@flowforge/engine` cancel function (`cancelWorkflowRun`)
  is implemented.
- Foundation Unit 14 — Ops API cancel route (`POST /api/runs/:id/cancel`) is
  implemented (the trigger that calls `cancelWorkflowRun`).
- Phase 1 Unit 04 — `AbortController` is threaded through `executeStep` and the
  heartbeat; lease-loss abort is already wired.
- Phase 1 Unit 03 — Container lifecycle (create/start/wait) is implemented.

---

## System Boundary

Changes are confined to:

| File | Change |
|---|---|
| `packages/handlers/src/handlers/python-script.ts` | Register `ctx.signal` abort listener that kills and removes the container |

No new packages, no migration, no API changes.

---

## Files to Modify

```
packages/handlers/
└── src/
    └── handlers/
        └── python-script.ts       # [MODIFY] add abort signal listener on container
```

---

## Implementation

### Abort Listener Registration

The listener must be registered **after** `container.start()` and **before**
`container.wait()`.

```ts
function registerAbortListener(
  container: Docker.Container,
  signal: AbortSignal,
  paths: WorkspacePaths,
  logger: StepContext['logger'],
): void {
  if (signal.aborted) {
    // Signal was already fired before we got here — kill immediately
    killContainer(container, paths, logger);
    return;
  }

  signal.addEventListener(
    'abort',
    () => {
      logger.warn(
        { containerId: container.id },
        'Abort signal received — killing container',
      );
      killContainer(container, paths, logger);
    },
    { once: true },
  );
}

async function killContainer(
  container: Docker.Container,
  paths: WorkspacePaths,
  logger: StepContext['logger'],
): Promise<void> {
  try {
    await container.kill();
    logger.info({ containerId: container.id }, 'Container killed');
  } catch (err) {
    // Container may have already exited — log and continue
    logger.warn({ err }, 'kill() error (container may have already exited)');
  }

  try {
    await container.remove({ force: true });
    logger.info({ containerId: container.id }, 'Container removed after abort');
  } catch (err) {
    logger.warn({ err }, 'remove() error on abort cleanup');
  }

  // Invariant 14: workspace cleanup on abort
  await cleanupWorkspace(paths.dir, logger);
}
```

### Integration into `runContainer` (after `container.start()`)

```ts
// After container.start():
registerAbortListener(container, ctx.signal, paths, ctx.logger);

// After log stream attach and abort listener:
const result = await container.wait();
```

When `container.kill()` fires, the `container.wait()` Promise resolves with a
non-zero exit code. The caller checks `exitCode !== 0` and throws, which
propagates up to `executeStep`'s catch block. `executeStep` then calls
`commitStepFailure`, which checks whether the worker's `AbortController` was
the cause and routes accordingly.

### Distinguishing Abort from Normal Failure

To allow `executeStep` to distinguish an operator cancellation abort from a
natural non-zero exit, pass the abort reason through:

```ts
// In executeStep catch block:
if (abortController.signal.aborted) {
  // Operator cancelled or lease lost
  await commitStepCancelled(pool, stepRun.id, ctx.workerId);
  await publishStepEvent({ type: 'step.cancelled', stepRunId: stepRun.id });
} else {
  // Natural failure — normal retry/DLQ flow
  await commitStepFailure(pool, stepRun.id, ctx.workerId, errMsg, stepRun.retry_policy);
}
```

Add `commitStepCancelled` to `packages/queue/src/` if it does not exist:

```ts
// packages/queue/src/step-commits.ts
export async function commitStepCancelled(
  pool: Pool,
  stepRunId: string,
  workerId: string,
): Promise<number> {
  const result = await pool.query(
    `UPDATE step_runs
     SET status = 'CANCELLED', updated_at = NOW()
     WHERE id = $1 AND worker_id = $2 AND status = 'RUNNING'`,
    [stepRunId, workerId],
  );
  return result.rowCount ?? 0;
}
```

---

## Verification Checklist

- [ ] Operator clicks "Cancel" on a running `python-script` step:
  - `step_runs.status` transitions to `CANCELLED` within 2 seconds.
  - `docker ps -a` shows no container for that `stepRunId`.
  - Workspace directory is deleted.
- [ ] Lease heartbeat fires abort (lease loss simulation):
  - Container is killed within one heartbeat interval (10 s).
  - Container is removed.
  - Workspace directory is deleted.
  - `step_runs` is left for the lease sweeper (status remains `RUNNING` until
    sweeper re-queues it — this is correct behavior for lease loss).
- [ ] If the container finishes naturally before the abort fires, the abort
      listener does NOT cause a crash (kill on already-exited container is
      handled gracefully).
- [ ] `commitStepCancelled` is exported from `packages/queue/src/index.ts`.
- [ ] `tsc --noEmit` exits 0 across the full monorepo.
- [ ] Only `packages/handlers/` and `packages/queue/` files are modified.
