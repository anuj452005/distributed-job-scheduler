# Unit 14 — Step Retry, Replay & Cancel API

## What This Unit Builds

The three operator action routes: retry an individual failed step, replay
a failed run from a chosen step, and cancel an active run. These are
mutation-only routes requiring `operator` role.

**Done looks like:**
- `POST /api/steps/:id/retry` on a `DEAD_LETTERED` step → step becomes `QUEUED`,
  a worker picks it up, and it executes again.
- `POST /api/runs/:id/replay` with `fromStepKey` → new run created, pre-replay
  steps are instantly `SUCCEEDED` with original outputs, replay-point step is `QUEUED`.
- `POST /api/runs/:id/cancel` → `PENDING`/`QUEUED` steps become `CANCELLED`,
  `RUNNING` steps become `CANCEL_REQUESTED`, run becomes `CANCELLED`.

---

## Dependencies

- Unit 03 — `@flowforge/shared` DTOs.
- Unit 04 — `packages/db` pool.
- Unit 09 — `packages/events` `publishStepEvent()`.
- Unit 10 — `packages/engine` `createReplayRun()`, `cancelWorkflowRun()`.
- Unit 11 — API server with auth.
- Unit 13 — Run API routes registered.

---

## Routes

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `POST` | `/api/steps/:id/retry` | ✓ | `operator` | Retry a single DEAD_LETTERED or FAILED step |
| `POST` | `/api/runs/:id/replay` | ✓ | `operator` | Replay a failed run from a step |
| `POST` | `/api/runs/:id/cancel` | ✓ | `operator` | Cancel an active run |

---

## Files to Create / Modify

```
packages/api/src/routes/runs/
├── retry-step.ts           # POST /api/steps/:id/retry
├── replay.ts               # POST /api/runs/:id/replay
└── cancel.ts               # POST /api/runs/:id/cancel
```

---

## Request/Response Shapes

### `POST /api/steps/:id/retry`

No request body.

**Logic:**
1. Fetch the `step_run` by `id`.
2. Validate: status must be `DEAD_LETTERED` or `FAILED`. Return `409` otherwise.
3. Reset: `attempt_count = 0`, `status = 'QUEUED'`, `error_message = NULL`,
   `next_run_at = NOW()`, `worker_id = NULL`, `lease_expires_at = NULL`.
4. Also reset the parent `workflow_run` to `RUNNING` if it was `FAILED`.
5. Publish `step.queued` event via `publishStepEvent()`.
6. Insert audit log row.

Response `200`:
```ts
{ data: { stepRunId: string; status: "QUEUED" } }
```

Errors:
- `404` — step not found
- `409` — step is not in a retryable state (`DEAD_LETTERED` / `FAILED`)

### `POST /api/runs/:id/replay` — Body

```ts
ReplayRunBody = {
  fromStepKey: string;
}
```

**Logic:**
1. Validate `fromStepKey` exists in the workflow.
2. Validate the original run status is `FAILED` or `COMPLETED`.
   Return `409` if the run is still `RUNNING`.
3. Call `createReplayRun(pool, runId, fromStepKey, userId)` from `packages/engine`.
4. Insert audit log row.
5. Publish `run.trigger` event for the new run.

Response `202`:
```ts
{ data: WorkflowRunDto }    // the new replay run
```

Errors:
- `404` — original run not found
- `422` — `fromStepKey` does not exist in the workflow
- `409` — original run is still `RUNNING` or `CANCELLED`

### `POST /api/runs/:id/cancel`

No request body.

**Logic:**
1. Validate run is `RUNNING` or `PENDING`. Return `409` if already terminal.
2. Call `cancelWorkflowRun(pool, runId)` from `packages/engine`.
3. Publish `workflow.cancelled` event.
4. Insert audit log row.

Response `200`:
```ts
{
  data: {
    runId:      string;
    cancelled:  number;   // PENDING+QUEUED steps set to CANCELLED
    requested:  number;   // RUNNING steps set to CANCEL_REQUESTED
  }
}
```

Errors:
- `404` — run not found
- `409` — run is already `COMPLETED`, `FAILED`, or `CANCELLED`

---

## Audit Log Entries

| Route | Action |
|-------|--------|
| `POST /api/steps/:id/retry` | `step.retry` |
| `POST /api/runs/:id/replay` | `run.replay` |
| `POST /api/runs/:id/cancel` | `run.cancel` |

---

## Verification Checklist

- [ ] `POST /api/steps/:id/retry` on `DEAD_LETTERED` step → step becomes `QUEUED` in DB.
- [ ] A worker picks up the retried step and executes it to `SUCCEEDED`.
- [ ] `POST /api/steps/:id/retry` on a `RUNNING` step → `409`.
- [ ] `POST /api/runs/:id/replay` on a `FAILED` run with `fromStepKey = "step-b"`:
      - New run created with `original_run_id` set.
      - Steps before `step-b` are `SUCCEEDED` with original `output_payload`.
      - `step-b` and downstream are `PENDING`/`QUEUED`.
- [ ] `POST /api/runs/:id/replay` on a `RUNNING` run → `409`.
- [ ] `POST /api/runs/:id/replay` with non-existent `fromStepKey` → `422`.
- [ ] `POST /api/runs/:id/cancel` on a `RUNNING` run:
      - `PENDING`/`QUEUED` steps → `CANCELLED`.
      - `RUNNING` steps → `CANCEL_REQUESTED`.
      - Run status → `CANCELLED`.
- [ ] `POST /api/runs/:id/cancel` on a `COMPLETED` run → `409`.
- [ ] All routes return `403` for `viewer` role.
- [ ] Audit log row created for each action.
- [ ] `tsc --noEmit` exits 0 on `packages/api`.
