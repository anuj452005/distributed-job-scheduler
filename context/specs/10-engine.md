# Unit 10 — Engine Package

## What This Unit Builds

`packages/engine` — DAG validation, `WorkflowRun` creation, all-`StepRun`
pre-creation, and downstream step promotion. This is the orchestration
brain: it knows the workflow graph but never talks to Redis, never calls
handlers, and never knows what HTTP looks like.

**Done looks like:**
- `validateWorkflowDag(steps)` rejects a workflow with a cycle and returns
  a field-level error message identifying which step creates the cycle.
- `validateWorkflowDag(steps)` rejects an unregistered handler name.
- `createWorkflowRun(workflowId, inputPayload, triggeredBy)` inserts one
  `workflow_runs` row and all `step_runs` in `PENDING` state, then promotes
  root steps (those with no dependencies) to `QUEUED`.
- After calling `createWorkflowRun`, root steps are `QUEUED` and non-root
  steps are `PENDING`.

---

## Dependencies

- Unit 01 — Monorepo scaffold.
- Unit 02 — Database schema (tables exist).
- Unit 03 — `@flowforge/shared` types.
- Unit 04 — `packages/db` pool.
- Unit 05 — `packages/queue` `promoteDownstreamSteps()`.
- Unit 06 — `packages/handlers` `handlerRegistry.has()` (for handler existence check).

---

## Files to Create

```
packages/engine/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # exports public API
    ├── dag-validator.ts      # validateWorkflowDag()
    ├── topological-sort.ts   # Kahn's algorithm
    ├── run-creator.ts        # createWorkflowRun()
    ├── step-pre-creator.ts   # pre-creates all StepRun rows
    ├── replay.ts             # createReplayRun()
    └── cancel.ts             # cancelWorkflowRun()
```

---

## Functions to Implement

### `dag-validator.ts` — `validateWorkflowDag(steps, registry)`

Input: `WorkflowStepInput[]` (from `@flowforge/shared` dto.ts).

Validates:

1. **Unique step keys** — no two steps share the same `stepKey`.
2. **Handler existence** — every `handlerName` is present in `registry.has()`.
3. **Dependency references** — every `dependsOn` entry refers to a `stepKey`
   that exists in the same workflow.
4. **No cycles** — topological sort succeeds (Kahn's algorithm).
5. **All steps reachable** — after topological sort, all steps are included
   (no disconnected subgraphs).
6. **Retry policy bounds** — `maxAttempts` in `[1, 10]`, `baseDelayMs` in `[100, 60_000]`.
7. **Timeout bounds** — `timeoutSeconds` in `[1, 3_600]`.

Returns:
```ts
type ValidationResult =
  | { valid: true }
  | { valid: false; errors: Array<{ field: string; message: string }> };
```

All errors are collected before returning — do not short-circuit on the first error.

### `topological-sort.ts` — `topologicalSort(steps)`

Kahn's algorithm implementation. Returns the sorted step keys or throws
if a cycle is detected (with the offending step keys identified).

### `run-creator.ts` — `createWorkflowRun(pool, workflowId, inputPayload, triggeredBy)`

```
1. INSERT workflow_runs row (status = 'PENDING')
2. Fetch workflow_steps and step_dependencies for workflowId
3. For each step: INSERT step_runs row (status = 'PENDING')
   - idempotency_key = `${workflowRunId}:${stepId}:1`
   - UNIQUE (workflow_run_id, step_id) constraint guarantees no duplicates
4. UPDATE workflow_runs SET status = 'RUNNING', started_at = NOW()
5. For each root step (no dependencies): UPDATE step_runs SET status = 'QUEUED'
6. Return the WorkflowRunDto
```

All of steps 1–5 execute inside a single database transaction.

**INVARIANT:** All `StepRun` rows are created in step 3 — no step run may
be created outside this function. The `UNIQUE (workflow_run_id, step_id)`
constraint enforces this at the DB level.

### `step-pre-creator.ts`

Helper used by `run-creator.ts`. Given a list of step definitions and a
`workflow_run_id`, inserts all `step_runs` rows in `PENDING` state in one
`INSERT … VALUES …` statement.

```sql
INSERT INTO step_runs
  (workflow_run_id, step_id, status, idempotency_key, input_payload,
   max_attempts, next_run_at, created_at)
VALUES
  ($1, $2, 'PENDING', $3, $4, $5, NOW(), NOW()),
  ...
ON CONFLICT (workflow_run_id, step_id) DO NOTHING;
```

### `replay.ts` — `createReplayRun(pool, originalRunId, fromStepKey, triggeredBy)`

```
1. Fetch the original workflow_run and all its step_runs
2. Validate: original run must be FAILED or COMPLETED (not RUNNING/CANCELLED)
3. INSERT new workflow_runs row linked to original via original_run_id
4. INSERT step_runs for ALL steps (all PENDING initially)
5. For steps BEFORE the replay point: mark them SUCCEEDED with original output_payload
6. For the replay step and all downstream: leave as PENDING, then promote root(s)
7. Return the new WorkflowRunDto
```

### `cancel.ts` — `cancelWorkflowRun(pool, runId)`

```
1. UPDATE step_runs SET status = 'CANCELLED'
   WHERE workflow_run_id = $runId AND status IN ('PENDING', 'QUEUED')
2. UPDATE step_runs SET status = 'CANCEL_REQUESTED'
   WHERE workflow_run_id = $runId AND status = 'RUNNING'
3. UPDATE workflow_runs SET status = 'CANCELLED', completed_at = NOW()
   WHERE id = $runId AND status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED')
4. Return updated row count
```

Workers check `signal.aborted` during execution. The SSE gateway (Unit 15)
can push a `cancel_requested` event via Redis, but the source of truth
for cancellation is the `CANCEL_REQUESTED` status in PostgreSQL.

---

## Verification Checklist

- [ ] `validateWorkflowDag` rejects a 3-step cycle (A→B→C→A) with a clear error
      identifying which step creates the cycle.
- [ ] `validateWorkflowDag` rejects an unknown `handlerName` with the step key in the error.
- [ ] `validateWorkflowDag` rejects a `dependsOn` referencing a non-existent step key.
- [ ] `validateWorkflowDag` accepts a valid linear 3-step workflow: returns `{ valid: true }`.
- [ ] `validateWorkflowDag` accepts a diamond DAG (A→B, A→C, B→D, C→D): returns `{ valid: true }`.
- [ ] `createWorkflowRun` on a 3-step workflow creates 3 `step_run` rows — root step `QUEUED`,
      others `PENDING`.
- [ ] `createWorkflowRun` called twice with the same workflow: two separate `workflow_run` rows,
      each with their own `step_run` rows (no cross-contamination).
- [ ] `createReplayRun` creates a new run where pre-replay steps have `SUCCEEDED` status
      and original `output_payload` values.
- [ ] `cancelWorkflowRun` sets `PENDING`/`QUEUED` steps to `CANCELLED` and `RUNNING`
      steps to `CANCEL_REQUESTED`.
- [ ] Engine does not import from `packages/worker`, `packages/api`, or `packages/events`.
- [ ] `tsc --noEmit` exits 0 on `packages/engine`.
