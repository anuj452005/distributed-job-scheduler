# Unit 20 — Dashboard Home: Metrics & Run List

## What This Unit Builds

The home page at `/` (dashboard root) — the operational overview that an
operator sees first. It shows four metric cards (live stats), a filterable
recent runs table with real-time SSE status updates, and worker health.

**Done looks like:**
- Navigate to `/` → four metric cards: Queue Depth, Active Workers, Jobs/sec,
  DLQ Count. All update within 30 s of a state change.
- Recent runs table shows the last 20 runs with live status badges that
  update via SSE as runs complete.
- Filter by status (RUNNING, FAILED, COMPLETED) and by date range.
- Clicking a run row navigates to `/runs/:id`.
- Worker health section shows N active workers (from `RUNNING` step_runs count
  or a dedicated endpoint).

---

## Dependencies

- Unit 13 — `GET /api/runs` available.
- Unit 15 — SSE global stream available.
- Unit 16 — `GET /metrics` available (for DLQ depth and job rate).
- Unit 17 — Dashboard shell.
- Unit 18 — API client pattern established.
- Unit 19 — `StepStatusBadge` component available.

---

## Files to Create / Modify

```
packages/dashboard/src/
├── api/
│   └── stats.ts                     # getStats() — wraps /metrics or a new /api/stats route
├── pages/
│   └── DashboardHomePage.tsx
└── components/
    └── dashboard/
        ├── MetricCard.tsx
        ├── MetricCardGrid.tsx
        ├── RecentRunsTable.tsx
        ├── RunStatusFilter.tsx
        └── WorkerHealthPanel.tsx
```

---

## Add a Stats API Route (this unit)

The dashboard home needs aggregated stats. Add `GET /api/stats` to the API
in this unit (it's a new route but trivially coupled to the home page):

```ts
// GET /api/stats — no role restriction (any authenticated user)
// Returns:
{
  data: {
    queueDepth:    number;   // step_runs WHERE status = 'QUEUED'
    activeWorkers: number;   // step_runs WHERE status = 'RUNNING' (distinct worker_id)
    dlqDepth:      number;   // step_runs WHERE status = 'DEAD_LETTERED'
    jobsLastHour:  number;   // step_runs WHERE status = 'SUCCEEDED' AND completed_at >= NOW()-1h
    failureRate:   number;   // failed / (succeeded + failed) in last hour, 0–1
  }
}
```

This avoids parsing Prometheus text format in the React client.

---

## Metric Cards

Four cards in a 2×2 (or 4×1) grid:

| Card | Value | Icon (Lucide) | Color |
|------|-------|---------------|-------|
| Queue Depth | `queueDepth` | `ListOrdered` | `--state-queued-text` |
| Active Workers | `activeWorkers` | `Cpu` | `--state-running-text` |
| Jobs Last Hour | `jobsLastHour` | `CheckCircle` | `--state-succeeded-text` |
| DLQ Count | `dlqDepth` | `AlertTriangle` | DLQ count > 0 → `--state-dlq-text`, else `--text-secondary` |

### MetricCard Component

```tsx
<MetricCard
  label="Queue Depth"
  value={stats.queueDepth}
  icon={<ListOrdered />}
  color="var(--state-queued-text)"
  description="Steps waiting to be claimed"
/>
```

Cards refresh every 30 s via a `setInterval` (not SSE — these are aggregates,
not per-run events).

---

## Recent Runs Table

### Columns
| Column | Content |
|--------|---------|
| Run ID | first 8 chars of UUID, monospace, clickable → `/runs/:id` |
| Workflow | workflow name |
| Status | `StepStatusBadge` (using `WorkflowStatus` colors) |
| Triggered | relative time ("3 minutes ago") |
| Duration | `completed_at - started_at` or "—" if still running |
| Steps | e.g., "3/5 SUCCEEDED" |

### Filtering
- Status filter chips: ALL / RUNNING / FAILED / COMPLETED / CANCELLED
- Date range picker (from / to) — uses shadcn `DatePickerWithRange` component.

### Real-Time Updates via SSE

Subscribe to the global SSE channel (`GET /api/events/stream` with no `runId`):

```ts
// useGlobalSSE.ts
function useGlobalSSE(onEvent: (event: StepEvent) => void): void
```

On `workflow.completed`, `workflow.failed`, `workflow.cancelled` events:
update the status badge of the matching run row in the table — do not
re-fetch the entire list.

On initial mount and every 60 s: re-fetch full run list from `GET /api/runs`
to catch any runs the SSE might have missed.

---

## Worker Health Panel

Simple panel below or beside the metric cards.

Shows:
- Count of distinct `worker_id` values in `step_runs WHERE status = 'RUNNING'`
  (from `GET /api/stats`).
- If `activeWorkers > 0`: green indicator dot + "N workers active".
- If `activeWorkers === 0` and `queueDepth > 0`: yellow indicator + "Queue has
  jobs but no active workers — check worker health".

---

## Layout

```
┌──────────────────────────────────────────────────────┐
│ h1: "Dashboard"                                       │
│                                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │Queue     │ │Workers   │ │Jobs/hr   │ │DLQ       │ │
│ │Depth     │ │Active    │ │          │ │Count     │ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                       │
│ Worker Health: ● 3 workers active                     │
│                                                       │
│ Recent Runs [filter chips] [date range]               │
│ ┌──────────────────────────────────────────────────┐  │
│ │ Run ID | Workflow | Status | Triggered | Duration │  │
│ │ ...    | ...      | ...    | ...       | ...      │  │
│ └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## Verification Checklist

- [ ] `GET /api/stats` returns all 5 fields with correct values.
- [ ] Dashboard home page loads within 1 s on first visit.
- [ ] All 4 metric cards show correct values after running a workflow.
- [ ] DLQ card turns `--state-dlq-text` color when `dlqDepth > 0`.
- [ ] Recent runs table shows runs sorted by `created_at DESC`.
- [ ] Status filter chip for "RUNNING" shows only RUNNING runs.
- [ ] Clicking a run row navigates to `/runs/:id`.
- [ ] SSE global stream: run status badge updates in the table without page refresh.
- [ ] Worker health panel shows correct active worker count.
- [ ] Worker health warning appears when queue has jobs but no active workers.
- [ ] Metric cards refresh every 30 s without user interaction.
- [ ] No hardcoded hex values in any component.
- [ ] `tsc --noEmit` exits 0 on `packages/dashboard`.
