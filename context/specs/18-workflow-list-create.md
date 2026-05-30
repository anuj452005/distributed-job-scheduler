# Unit 18 — Workflow List & Create Pages

## What This Unit Builds

Two functional dashboard pages:
1. **Workflow List** (`/workflows`) — a table of all workflows with search,
   a "New Workflow" button, and per-row trigger/delete actions.
2. **Workflow Create/Edit form** (`/workflows/new`) — a step builder where
   the operator adds steps, selects handlers, sets retry policies, and
   defines dependency edges. On submit: calls `POST /api/workflows`, shows
   validation errors inline.

**Done looks like:**
- Navigate to `/workflows` → table lists all workflows with name, step count,
  and created date.
- Click "New Workflow" → form renders with an "Add Step" button.
- Add 3 steps, set dependencies (e.g., step-b depends on step-a), click Save.
- Invalid DAG (cycle) → form shows the field-level validation error from the API.
- Valid DAG → workflow appears in the list; clicking its row navigates to `/workflows/:id`.
- Trigger run button → `POST /api/workflows/:id/runs` and navigate to the new run's detail page.

---

## Dependencies

- Unit 12 — Workflow CRUD API available.
- Unit 13 — Run trigger API available.
- Unit 17 — Dashboard shell and auth gate in place.

---

## Files to Create

```
packages/dashboard/src/
├── api/
│   ├── client.ts                    # typed API client (fetch wrapper)
│   └── workflows.ts                 # API calls for workflow operations
├── pages/
│   └── workflows/
│       ├── WorkflowsPage.tsx        # list page
│       ├── WorkflowCreatePage.tsx   # create form
│       └── WorkflowDetailPage.tsx   # detail/edit (placeholder for now)
└── components/
    └── workflows/
        ├── WorkflowTable.tsx
        ├── WorkflowForm.tsx
        ├── StepBuilder.tsx          # add/remove steps
        ├── StepCard.tsx
        └── DependencySelector.tsx   # multi-select for dependsOn
```

---

## API Client (`api/client.ts`)

Typed wrapper around `fetch`. Attaches the Clerk JWT to every request.
Uses `useAuth()` from `@clerk/react` to get the token.

```ts
async function apiClient<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  token?: string,
): Promise<T>
```

Always returns `data` from `{ data: T }` responses.
Throws a typed `ApiError` on `4xx`/`5xx` responses with `code` and `message`.

---

## Workflow List Page

### Layout
- Page heading: "Workflows" (h1, `--text-xl`)
- Top-right: "New Workflow" button (primary accent)
- Search input filters by workflow name (client-side on the fetched list)
- Table columns: Name | Steps | Created | Actions

### Table Row Actions
- **Trigger** — `POST /api/workflows/:id/runs` with `{}` input, then navigate to `/runs/:newRunId`
- **Delete** — confirmation modal, then `DELETE /api/workflows/:id`

### Data Fetching
- Fetch on mount: `GET /api/workflows`
- Re-fetch after any mutation (create, delete)
- Loading state: skeleton rows (3 placeholder rows with animated pulse)
- Empty state: centered icon + "No workflows yet. Create your first workflow."

---

## Workflow Create Form (`WorkflowForm.tsx`)

### Fields
- **Name** — text input, required
- **Description** — textarea, optional
- **Steps** — dynamic list, add/remove steps via "Add Step" button

### Step Card (`StepCard.tsx`)
Each step has:
- **Step Key** — text input (unique within workflow, auto-suggested: `step-a`, `step-b`)
- **Handler** — dropdown/select from the registered handler list
  (hardcoded list in MVP: `http-request`, `send-email`, `sql-query`, `blob-to-postgres`,
  `transform-json`, `repo-indexer`, `embedding-generator`)
- **Depends On** — multi-select of other step keys currently in the form
- **Max Attempts** — number input (default 3)
- **Base Delay (ms)** — number input (default 1000)
- **Timeout (seconds)** — number input (default 300)
- **Input Config** — JSON textarea (rendered as monospace, validated as valid JSON on blur)

### Validation & Error Display
- Submit calls `POST /api/workflows`.
- `422` response: display field errors inline beneath the relevant step card.
  Example: "steps[1].dependsOn: creates a cycle with step-a"
- `400`/`500`: top-level error toast notification.

### Submission Flow
1. Serialize form state to `CreateWorkflowBody` shape.
2. `POST /api/workflows`
3. On success → navigate to `/workflows` (list refreshes).
4. On `422` → parse `details` array and map errors to form fields.

---

## Styling Notes

All styles follow `ui-context.md` and `code-standards.md`:
- No hardcoded hex values anywhere.
- Table row height: 40px. Row hover: `--bg-surface-hover`.
- Status badges use status color tokens (not needed on this page, but the pattern is established).
- Buttons use `--accent-primary` / `--accent-primary-hover` for primary actions.
- Danger (delete) uses `--danger-action` / `--danger-action-hover`.
- All border radii use CSS variable tokens from `ui-context.md`.

---

## Verification Checklist

- [ ] `GET /api/workflows` data populates the table within 500ms.
- [ ] Search input filters the visible rows by name (client-side).
- [ ] "New Workflow" → form renders with at least one empty step card.
- [ ] "Add Step" button adds a new step card below existing ones.
- [ ] Removing a step updates the "Depends On" selectors in other step cards.
- [ ] Submit with empty name → inline error "Name is required".
- [ ] Submit with cycle (step-b depends on step-a, step-a depends on step-b) → API returns
      `422` and the error appears on the relevant step's "Depends On" field.
- [ ] Submit with valid 3-step workflow → success, workflow appears in list, navigated back to list.
- [ ] "Trigger" action → new run created, navigated to `/runs/:id`.
- [ ] "Delete" action → confirmation modal; confirm → workflow removed from list.
- [ ] Loading state shows skeleton rows while data is fetching.
- [ ] Empty state shows when no workflows exist.
- [ ] No hardcoded hex values in any component file.
- [ ] `tsc --noEmit` exits 0 on `packages/dashboard`.
