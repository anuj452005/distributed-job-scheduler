# Unit 19 — Run Detail Page & DAG Viewer

## What This Unit Builds

The run detail page at `/runs/:id` — the operational centerpiece of the
dashboard. It shows a live ReactFlow DAG with step state colours, an SSE
subscription that updates the DAG in real time, and a step detail drawer
that opens on node click and shows structured logs.

**Done looks like:**
- Navigate to `/runs/:id` → DAG renders with all steps as nodes coloured
  by their current state (PENDING = dark, QUEUED = blue, RUNNING = cyan, etc.).
- Trigger a workflow run, open its detail page — step states animate from
  QUEUED → RUNNING → SUCCEEDED within 3 seconds of the event, without
  a page refresh (SSE-driven).
- Click a step node → right drawer slides in showing step metadata and logs.
- "Retry" button on a failed step → calls `POST /api/steps/:id/retry`.
- "Replay From Here" button on a step → calls `POST /api/runs/:id/replay`.
- "Cancel Run" button → calls `POST /api/runs/:id/cancel`.

---

## Dependencies

- Unit 13 — `GET /api/runs/:id` available.
- Unit 14 — Retry, replay, cancel API routes available.
- Unit 15 — SSE gateway at `GET /api/events/stream` available.
- Unit 17 — Dashboard shell in place.
- Unit 18 — API client pattern established.

---

## Files to Create

```
packages/dashboard/src/
├── api/
│   └── runs.ts                      # getRunDetail(), retryStep(), replayRun(), cancelRun()
├── hooks/
│   └── useSSE.ts                    # SSE client hook
├── pages/
│   └── runs/
│       ├── RunDetailPage.tsx         # layout: DAG + drawer
│       └── RunsListPage.tsx          # placeholder (populated in Unit 20)
└── components/
    └── runs/
        ├── DagCanvas.tsx             # ReactFlow canvas component
        ├── StepNode.tsx              # custom ReactFlow node
        ├── StepDetailDrawer.tsx      # right-side drawer
        ├── LogViewer.tsx             # virtualized log list
        ├── RunStatusBar.tsx          # run status + action buttons (Cancel, Replay All)
        └── StepStatusBadge.tsx       # reusable pill badge for StepStatus
```

---

## ReactFlow DAG (`DagCanvas.tsx`)

Follow the rules in `ui-context.md` → DAG Graph section exactly.

### Node Layout
- Use ELK or Dagre layout algorithm to auto-position nodes from the step
  dependency graph. (`@dagrejs/dagre` is the simplest choice.)
- Node minimum size: `180px × 56px`.
- Node shape: rectangle with `--radius-md` (6px) border radius.

### Node Colors (from `ui-context.md`)
```
background: var(--state-{status}-bg)
border: 1px solid var(--state-{status}-border)
label color: var(--state-{status}-text)
font-family: var(--font-mono)
font-size: 12px
```

- Selected node: `box-shadow: 0 0 0 2px var(--accent-primary)`
- Edge color: `var(--border-strong)` for inactive, `var(--state-running-text)` for edge
  leading into a RUNNING node.

### Node Data
Each `StepNode` receives:
```ts
type StepNodeData = {
  stepKey:       string;
  handlerName:   string;
  status:        StepStatus;
  attemptCount:  number;
  maxAttempts:   number;
  startedAt:     string | null;
  completedAt:   string | null;
}
```

### DAG → ReactFlow Conversion
```ts
function buildDagElements(run: WorkflowRunDetailDto): { nodes: Node[], edges: Edge[] }
```

Build `nodes` from `run.steps`; build `edges` from the workflow's `step_dependencies`
(fetch from `GET /api/workflows/:id` to get dependency edges, or include them in the
run detail response — whichever is simpler). Recommend including dependency edges in
the `GET /api/runs/:id` response to avoid an extra round trip.

---

## SSE Hook (`useSSE.ts`)

```ts
function useSSE(runId: string, onEvent: (event: StepEvent) => void): void
```

- Opens an `EventSource` at `/api/events/stream?runId=<id>` with the Clerk token
  in the URL (workaround since `EventSource` doesn't support custom headers) or
  use a cookie-based approach via Clerk session cookie.
  **Preferred:** Use a query-param token: `?token=<clerk_jwt>` and validate it on
  the SSE route handler.
- On `error` / `close`: wait 2 s, re-fetch full state from `GET /api/runs/:id`,
  then re-open the `EventSource`.
- Merges events into state: only updates the changed step/run field.
- Cleans up `EventSource` on component unmount.

### State Merge Pattern

```ts
// On SSE event:
setState(prev => ({
  ...prev,
  steps: prev.steps.map(step =>
    step.id === event.stepRunId
      ? { ...step, status: event.status }
      : step,
  ),
}));
```

Never replace the entire state from an SSE event.

---

## Step Detail Drawer (`StepDetailDrawer.tsx`)

Opens as a 360px right panel when a step node is clicked.

Sections:
1. **Header** — step key, handler name, status badge
2. **Metadata** — attempt count / max, started at, completed at, worker ID
3. **Input Payload** — collapsed JSON block (monospace)
4. **Output Payload** — collapsed JSON block (monospace, only if SUCCEEDED)
5. **Error** — red block with error message (only if FAILED / DEAD_LETTERED)
6. **Logs** — virtualized log list (`<LogViewer />`)
7. **Actions** — Retry button (DEAD_LETTERED only), "Replay From Here" button (any terminal state)

### Log Viewer (`LogViewer.tsx`)

- Fetches from `GET /api/runs/:id` which includes step logs in the step detail.
  (Or a dedicated `GET /api/steps/:id/logs` endpoint — add it in this unit if needed.)
- Virtualized with `@tanstack/react-virtual` for performance.
- Each log line: timestamp (muted) | level (colored by `--log-{level}`) | message (mono).
- Background: `--bg-base`.

---

## Three-Column Layout

```
┌──────────────────────────────────────────────────────┐
│ RunStatusBar: run ID, status badge, Cancel/Replay btns │
├────────────────────────────┬─────────────────────────┤
│ Step list (240px)          │ ReactFlow DAG canvas     │
│ - Step key                 │ (flexible width)         │
│ - Status badge             │                          │
│ - Clicking opens drawer    │                          │
├────────────────────────────┤                          │
│ [when step selected]       │                          │
│ StepDetailDrawer (360px)   │                          │
└────────────────────────────┴─────────────────────────┘
```

On mobile / narrow viewport: collapse to single-column (drawer becomes full-width modal).

---

## npm Dependencies (dashboard)

```
reactflow                        (@xyflow/react)
@dagrejs/dagre                   (DAG layout)
@tanstack/react-virtual          (log virtualization)
```

---

## Verification Checklist

- [ ] `/runs/:id` renders the ReactFlow DAG with correct node count.
- [ ] Node colors match `StepStatus` tokens from `ui-context.md` (verify for all 9 states).
- [ ] Trigger a workflow run → DAG animates from QUEUED → RUNNING → SUCCEEDED within 3 s
      without page refresh. (Success criterion #7 from `project-overview.md`)
- [ ] Click a step node → StepDetailDrawer slides in on the right.
- [ ] Drawer shows: step key, handler name, status badge, attempt count, timestamps.
- [ ] Drawer shows input payload in a monospace JSON block.
- [ ] Logs are displayed in the drawer with level colours.
- [ ] "Retry" button visible and clickable only when step is `DEAD_LETTERED`.
- [ ] "Replay From Here" button calls `POST /api/runs/:id/replay` and navigates to the new run.
- [ ] "Cancel Run" button calls `POST /api/runs/:id/cancel` and run status updates in real time.
- [ ] SSE reconnect: manually disconnect Redis → dashboard re-fetches from REST and resumes SSE.
- [ ] No hardcoded hex values in any component.
- [ ] `tsc --noEmit` exits 0 on `packages/dashboard`.
