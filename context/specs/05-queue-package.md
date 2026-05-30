# Unit 05 — Queue SQL Package

## What This Unit Builds

`packages/queue` — all raw SQL for the job-claiming pipeline. This is
the correctness-critical layer. Every query here must satisfy the
architectural invariants: `SKIP LOCKED`, fencing-token commit, lease
sweeper, and downstream step promotion.

No business logic. No handler calls. Only SQL functions exported as
typed TypeScript wrappers.

**Done looks like:**
- A unit test inserts a `QUEUED` `step_run`, calls `claimNextStep()`,
  and asserts: the row is now `RUNNING`, has a `worker_id`, and has a
  `lease_expires_at` in the future.
- A second concurrent call to `claimNextStep()` while the first is
  still `RUNNING` returns `null` (nothing to claim).
- `commitStepSuccess()` with the correct `worker_id` updates the row to
  `SUCCEEDED` and returns `1`.
- `commitStepSuccess()` with a wrong `worker_id` (fencing miss) returns `0`.

---

## Dependencies

- Unit 01 — Monorepo scaffold.
- Unit 03 — `@flowforge/shared` types (`StepRunRow`, `StepStatus`).
- Unit 04 — `packages/db` pool available.

---

## Files to Create

```
packages/queue/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # re-exports all functions
    ├── claim.ts              # claimNextStep()
    ├── commit.ts             # commitStepSuccess(), commitStepFailure()
    ├── heartbeat.ts          # refreshLease()
    ├── sweeper.ts            # sweepExpiredLeases()
    ├── promote.ts            # promoteDownstreamSteps()
    ├── retry-scheduler.ts    # promoteDelayedRetries()
    └── dead-letter.ts        # moveToDeadLetter()
```

---

## Functions to Implement

### `claim.ts` — `claimNextStep(pool, workerId, leaseDurationSeconds)`

```sql
BEGIN;

SELECT id, workflow_run_id, step_id, input_payload, attempt_count,
       max_attempts, idempotency_key, priority
FROM step_runs
WHERE status = 'QUEUED'
  AND next_run_at <= NOW()
ORDER BY priority DESC, next_run_at ASC, created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- If a row is found:
UPDATE step_runs
SET
  status           = 'RUNNING',
  worker_id        = $workerId,
  lease_expires_at = NOW() + INTERVAL '$leaseDurationSeconds seconds',
  attempt_count    = attempt_count + 1,
  started_at       = NOW()
WHERE id = $claimedId;

COMMIT;
```

Returns the claimed `StepRunRow` or `null` if nothing is available.

### `commit.ts` — `commitStepSuccess(pool, stepRunId, workerId, outputPayload)`

**INVARIANT:** Must use the fencing-token query. Any UPDATE that returns
`rowCount === 0` means the lease was lost — caller must discard the result.

```sql
UPDATE step_runs
SET
  status         = 'SUCCEEDED',
  output_payload = $outputPayload,
  completed_at   = NOW(),
  worker_id      = NULL,
  lease_expires_at = NULL
WHERE id            = $stepRunId
  AND worker_id     = $workerId
  AND status        = 'RUNNING'
  AND lease_expires_at > NOW();
```

Returns `rowCount` (0 = fencing miss, 1 = success).

### `commit.ts` — `commitStepFailure(pool, stepRunId, workerId, errorMessage, retryPolicy)`

```sql
-- If attempt_count < max_attempts: move to RETRYING
UPDATE step_runs
SET
  status       = 'RETRYING',
  error_message = $errorMessage,
  next_run_at  = NOW() + INTERVAL '$retryDelayMs milliseconds',
  worker_id    = NULL,
  lease_expires_at = NULL
WHERE id            = $stepRunId
  AND worker_id     = $workerId
  AND status        = 'RUNNING'
  AND lease_expires_at > NOW()
  AND attempt_count < max_attempts;

-- If attempt_count >= max_attempts: dead-letter (see dead-letter.ts)
```

Retry delay formula: `baseDelay × 2^(attempt-1) + randomJitter(0..baseDelay)`.

### `heartbeat.ts` — `refreshLease(pool, stepRunId, workerId, leaseDurationSeconds)`

```sql
UPDATE step_runs
SET lease_expires_at = NOW() + INTERVAL '$leaseDurationSeconds seconds'
WHERE id          = $stepRunId
  AND worker_id   = $workerId
  AND status      = 'RUNNING';
```

Returns `rowCount`. Worker should log a warning if `rowCount === 0` (lease already lost).

### `sweeper.ts` — `sweepExpiredLeases(pool)`

Two queries (can run in the same transaction):

```sql
-- Re-queue steps with remaining attempts
UPDATE step_runs
SET
  status           = 'QUEUED',
  worker_id        = NULL,
  lease_expires_at = NULL,
  next_run_at      = NOW()
WHERE status           = 'RUNNING'
  AND lease_expires_at < NOW()
  AND attempt_count    < max_attempts
RETURNING id, workflow_run_id;

-- Dead-letter exhausted steps
UPDATE step_runs
SET
  status           = 'DEAD_LETTERED',
  worker_id        = NULL,
  lease_expires_at = NULL,
  completed_at     = NOW()
WHERE status           = 'RUNNING'
  AND lease_expires_at < NOW()
  AND attempt_count    >= max_attempts
RETURNING id, workflow_run_id;
```

Returns `{ requeued: string[], deadLettered: string[] }` (arrays of `step_run` IDs).

### `promote.ts` — `promoteDownstreamSteps(pool, workflowRunId, succeededStepId)`

```sql
UPDATE step_runs
SET status = 'QUEUED', next_run_at = NOW()
WHERE workflow_run_id = $workflowRunId
  AND status = 'PENDING'
  AND id IN (
    -- steps whose ALL dependencies are now SUCCEEDED
    SELECT sr.id
    FROM step_runs sr
    JOIN step_dependencies sd ON sd.step_id = sr.step_id
    GROUP BY sr.id
    HAVING COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM step_runs dep
        WHERE dep.step_id = sd.depends_on_step_id
          AND dep.workflow_run_id = $workflowRunId
          AND dep.status = 'SUCCEEDED'
      )
    ) = COUNT(*)
  )
RETURNING id;
```

Returns `string[]` — the IDs of newly promoted `step_run` rows.

### `retry-scheduler.ts` — `promoteDelayedRetries(pool)`

```sql
UPDATE step_runs
SET status = 'QUEUED'
WHERE status     = 'RETRYING'
  AND next_run_at <= NOW()
RETURNING id;
```

Returns the count of promoted rows.

### `dead-letter.ts` — `moveToDeadLetter(pool, workflowRunId)`

After a step is dead-lettered, mark the parent `workflow_run` as `FAILED`:

```sql
UPDATE workflow_runs
SET status = 'FAILED', completed_at = NOW()
WHERE id = $workflowRunId
  AND status NOT IN ('FAILED', 'CANCELLED', 'COMPLETED');
```

---

## Verification Checklist

- [ ] `claimNextStep()` returns a `StepRunRow` when a `QUEUED` row exists.
- [ ] Two concurrent `claimNextStep()` calls on one row: only one succeeds
      (the other returns `null`) — test with a real postgres transaction.
- [ ] `commitStepSuccess()` with correct `worker_id` → row is `SUCCEEDED`, `rowCount = 1`.
- [ ] `commitStepSuccess()` with wrong `worker_id` → `rowCount = 0`, row unchanged.
- [ ] `commitStepSuccess()` with expired `lease_expires_at` → `rowCount = 0`.
- [ ] `sweepExpiredLeases()` re-queues a `RUNNING` row with expired lease and
      `attempt_count < max_attempts`.
- [ ] `sweepExpiredLeases()` dead-letters a `RUNNING` row with expired lease and
      `attempt_count >= max_attempts`.
- [ ] `promoteDelayedRetries()` moves `RETRYING` rows with `next_run_at <= NOW()`
      to `QUEUED`.
- [ ] `tsc --noEmit` exits 0 on `packages/queue`.
- [ ] `packages/queue` does not import from `packages/engine`, `packages/worker`,
      `packages/handlers`, or `packages/api`.
