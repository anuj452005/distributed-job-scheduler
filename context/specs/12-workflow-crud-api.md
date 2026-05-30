# Unit 12 — Workflow CRUD API

## What This Unit Builds

The full set of HTTP routes for managing workflow definitions:
create, list, get, update, and delete. DAG validation runs at save time
using the engine. Invalid workflows are rejected with field-level errors.

**Done looks like:**
- `POST /api/workflows` with a valid 3-step DAG → `201` with the created `WorkflowDto`.
- `POST /api/workflows` with a cycle in the DAG → `422` with field-level error identifying
  the cycle.
- `POST /api/workflows` with an unregistered handler → `422` with the handler name in the error.
- `GET /api/workflows` → `200` with a list of all workflows.
- `GET /api/workflows/:id` → `200` with full workflow detail including steps and dependency edges.
- `DELETE /api/workflows/:id` → `204`; subsequent `GET` returns `404`.

---

## Dependencies

- Unit 03 — `@flowforge/shared` DTOs (`CreateWorkflowBody`, `WorkflowDto`, `WorkflowStepInput`).
- Unit 04 — `packages/db` pool.
- Unit 10 — `packages/engine` `validateWorkflowDag()`.
- Unit 11 — API server with auth middleware registered.

---

## Routes

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `POST` | `/api/workflows` | ✓ | `operator` | Create a new workflow |
| `GET` | `/api/workflows` | ✓ | any | List all workflows (paginated) |
| `GET` | `/api/workflows/:id` | ✓ | any | Get workflow detail with steps |
| `PUT` | `/api/workflows/:id` | ✓ | `operator` | Update a workflow (name/description/steps) |
| `DELETE` | `/api/workflows/:id` | ✓ | `operator` | Delete a workflow (only if no active runs) |

---

## Files to Create

```
packages/api/src/routes/
├── workflows/
│   ├── index.ts            # registers all workflow routes
│   ├── create.ts           # POST /api/workflows
│   ├── list.ts             # GET /api/workflows
│   ├── get.ts              # GET /api/workflows/:id
│   ├── update.ts           # PUT /api/workflows/:id
│   └── delete.ts           # DELETE /api/workflows/:id
packages/api/src/services/
└── workflow-service.ts     # DB queries for workflow CRUD
```

---

## Request/Response Shapes

### `POST /api/workflows` — Body

```ts
// From @flowforge/shared dto.ts
CreateWorkflowBody = {
  name:        string;
  description?: string;
  steps: Array<{
    stepKey:        string;
    handlerName:    string;
    inputConfig:    Record<string, unknown>;
    retryPolicy:    { maxAttempts: number; baseDelayMs: number };
    timeoutSeconds: number;
    dependsOn:      string[];
  }>;
}
```

Validate the body with Zod before touching the DB or engine. Return `400`
on malformed JSON; return `422` on semantic errors (DAG validation).

### `POST /api/workflows` — Success Response (`201`)

```ts
{
  data: WorkflowDto   // includes id, name, version, stepCount, createdAt, updatedAt
}
```

### `POST /api/workflows` — Validation Error Response (`422`)

```ts
{
  error: {
    code:    "VALIDATION_ERROR",
    message: "Workflow definition is invalid",
    details: Array<{ field: string; message: string }>
  }
}
```

### `GET /api/workflows` — Response (`200`)

```ts
{
  data: {
    items:  WorkflowDto[];
    total:  number;
    page:   number;
    limit:  number;
  }
}
```

Query params: `?page=1&limit=20&search=<name_fragment>`

### `GET /api/workflows/:id` — Response (`200`)

```ts
{
  data: WorkflowDto & {
    steps: Array<{
      id:              string;
      stepKey:         string;
      handlerName:     string;
      inputConfig:     Record<string, unknown>;
      retryPolicy:     { maxAttempts: number; baseDelayMs: number };
      timeoutSeconds:  number;
      dependsOn:       string[];   // step keys
    }>;
  }
}
```

---

## Service Layer (`workflow-service.ts`)

Route handlers must be thin. All DB queries live in the service:

```ts
export async function createWorkflow(pool, body, userId): Promise<WorkflowDto>
export async function listWorkflows(pool, opts): Promise<{ items: WorkflowDto[], total: number }>
export async function getWorkflow(pool, id): Promise<WorkflowDetailDto | null>
export async function updateWorkflow(pool, id, body, userId): Promise<WorkflowDto | null>
export async function deleteWorkflow(pool, id): Promise<boolean>
```

`deleteWorkflow` must check for active `workflow_runs` (status `RUNNING`) before
deleting. If any exist, return `409 CONFLICT`.

---

## Audit Logging

Every `POST`, `PUT`, `DELETE` must insert a row into `audit_logs`:

```ts
await pool.query(
  `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
   VALUES ($1, $2, $3, $4)`,
  [userId, 'workflow.create', workflowId, { name }],
);
```

---

## Verification Checklist

- [ ] `POST /api/workflows` with valid 3-step linear DAG → `201`, workflow appears in DB.
- [ ] `POST /api/workflows` with cycle (A→B→A) → `422` with field `steps[1].dependsOn`
      and message mentioning cycle.
- [ ] `POST /api/workflows` with `handlerName: "nonexistent"` → `422` with handler name
      in error message.
- [ ] `GET /api/workflows` returns all created workflows with correct `stepCount`.
- [ ] `GET /api/workflows/:id` returns step definitions with `dependsOn` arrays.
- [ ] `GET /api/workflows/nonexistent-id` → `404`.
- [ ] `DELETE /api/workflows/:id` on a workflow with an active `RUNNING` run → `409`.
- [ ] `DELETE /api/workflows/:id` on a workflow with no active runs → `204`.
- [ ] Audit log row created for each `POST` and `DELETE`.
- [ ] `viewer` role cannot `POST` or `DELETE` → `403`.
- [ ] `tsc --noEmit` exits 0 on `packages/api`.
