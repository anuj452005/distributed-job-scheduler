# Unit 13 — Run Trigger & Status API

## What This Unit Builds

The HTTP routes to trigger a workflow run and query run status. This
wires the engine's `createWorkflowRun()` to the REST API surface and
provides the `GET /api/runs/:id` endpoint that the dashboard uses for
its initial full-state fetch on load or reconnect.

**Done looks like:**
- `POST /api/workflows/:id/runs` with a valid input payload → creates a
  `workflow_run` and all `step_runs`, root steps are `QUEUED`, returns `202`
  with the `WorkflowRunDto`.
- A running worker picks up the `QUEUED` steps and executes them.
- `GET /api/runs/:id` returns the full run state including all `step_runs`
  with their current statuses.
- `GET /api/runs` returns a paginated list of all workflow runs.
- `GET /api/workflows/:id/runs` returns runs scoped to a specific workflow.

---

## Dependencies

- Unit 03 — `@flowforge/shared` DTOs.
- Unit 04 — `packages/db` pool.
- Unit 10 — `packages/engine` `createWorkflowRun()`.
- Unit 11 — API server with auth.
- Unit 12 — Workflow CRUD API (workflow must exist).

---

## Routes

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `POST` | `/api/workflows/:id/runs` | ✓ | `operator` | Trigger a new workflow run |
| `GET` | `/api/runs` | ✓ | any | List all runs (paginated, filterable) |
| `GET` | `/api/runs/:id` | ✓ | any | Get full run detail with all step_runs |
| `GET` | `/api/workflows/:id/runs` | ✓ | any | List runs for a specific workflow |

---

## Files to Create

```
packages/api/src/routes/
├── runs/
│   ├── index.ts            # registers all run routes
│   ├── trigger.ts          # POST /api/workflows/:id/runs
│   ├── list.ts             # GET /api/runs
│   ├── get.ts              # GET /api/runs/:id
│   └── list-by-workflow.ts # GET /api/workflows/:id/runs
packages/api/src/services/
└── run-service.ts          # DB queries for run status
```

---

## Request/Response Shapes

### `POST /api/workflows/:id/runs` — Body

```ts
TriggerRunBody = {
  inputPayload?: Record<string, unknown>;
}
```

### `POST /api/workflows/:id/runs` — Success Response (`202 Accepted`)

Return `202` (not `201`) because the run is asynchronous — it is accepted
and will execute. The response body is the initial `WorkflowRunDto`.

```ts
{
  data: WorkflowRunDto   // status will be 'RUNNING', step statuses will show PENDING/QUEUED
}
```

### `GET /api/runs/:id` — Response (`200`)

```ts
{
  data: WorkflowRunDto & {
    workflowName: string;
    steps: StepRunDto[];    // all step_runs with handler_name and step_key joined
  }
}
```

This is the full-state response the dashboard uses on load. It must return
complete, current data for every step — no pagination on steps.

### `GET /api/runs` — Query Params & Response

Query params: `?page=1&limit=20&status=RUNNING&workflowId=<uuid>&from=<iso>&to=<iso>`

Response:
```ts
{
  data: {
    items: Array<WorkflowRunDto & { workflowName: string }>;
    total: number;
    page:  number;
    limit: number;
  }
}
```

---

## Service Layer (`run-service.ts`)

```ts
export async function triggerRun(pool, workflowId, inputPayload, userId): Promise<WorkflowRunDto>
export async function getRunDetail(pool, runId): Promise<WorkflowRunDetailDto | null>
export async function listRuns(pool, opts): Promise<{ items: RunSummaryDto[], total: number }>
export async function listRunsByWorkflow(pool, workflowId, opts): Promise<...>
```

`triggerRun` calls `createWorkflowRun()` from `packages/engine`. It does not
contain the engine logic itself.

---

## Audit Logging

`POST /api/workflows/:id/runs` must insert a row into `audit_logs`:

```ts
await pool.query(
  `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
   VALUES ($1, 'run.trigger', $2, $3)`,
  [userId, runId, { workflowId, inputPayloadSize: JSON.stringify(inputPayload).length }],
);
```

Note: do not log `inputPayload` contents — it may contain sensitive data.
Only log its size.

---

## Error Cases

| Condition | Status | Code |
|-----------|--------|------|
| Workflow `id` not found | `404` | `WORKFLOW_NOT_FOUND` |
| Workflow has no steps | `422` | `WORKFLOW_EMPTY` |
| Run `id` not found | `404` | `RUN_NOT_FOUND` |
| Invalid `inputPayload` (not a JSON object) | `422` | `VALIDATION_ERROR` |

---

## Verification Checklist

- [ ] `POST /api/workflows/:id/runs` → `202` with a `WorkflowRunDto`; all root steps
      have `status: "QUEUED"` and non-root steps have `status: "PENDING"`.
- [ ] With a running worker: trigger a 2-step workflow → within seconds, `GET /api/runs/:id`
      shows both steps `SUCCEEDED` and the run `COMPLETED`.
- [ ] `POST /api/workflows/:id/runs` with invalid `workflowId` → `404`.
- [ ] `GET /api/runs/:id` returns all `step_runs` with `stepKey` and `handlerName`.
- [ ] `GET /api/runs?status=RUNNING` returns only `RUNNING` runs.
- [ ] `GET /api/runs?from=<iso>&to=<iso>` filters by `created_at` range.
- [ ] `viewer` role can call all GET routes.
- [ ] `viewer` role calling `POST /api/workflows/:id/runs` → `403`.
- [ ] Audit log row created for every trigger.
- [ ] `tsc --noEmit` exits 0 on `packages/api`.
