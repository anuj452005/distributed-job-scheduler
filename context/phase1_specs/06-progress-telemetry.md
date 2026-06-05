# Phase 1 — Unit 06: Progress Telemetry IPC Parser

## What This Unit Builds

Extends the log stream handler (Unit 05) to detect and parse
`__PROGRESS__ <json>` sentinel lines printed by Python scripts. When a matching
line is found:

1. The JSON payload `{ "percent": N, "stage": "..." }` is extracted.
2. `step_runs.progress` is updated atomically in PostgreSQL.
3. A `step.progress` event is published to Redis Pub/Sub so the SSE gateway
   can push the update to the ReactFlow node's progress bar in real time.

**Done looks like:**
- A Python script that prints
  `print(f"__PROGRESS__ {json.dumps({'percent': 75, 'stage': 'Processing'})}")`
  causes `step_runs.progress = 75` in the database while the container is
  still running.
- The ReactFlow DAG node for that step shows a 75% progress bar in the
  dashboard (Success Criterion 6).
- Non-matching `__PROGRESS__` lines (malformed JSON) log a warning and are
  skipped — they do NOT crash the stream handler.

---

## Dependencies

- Phase 1 Unit 05 — Log stream handler implemented; `__PROGRESS__` lines
  are already being filtered (skipped without writing to DB).

---

## System Boundary

Changes are confined to:

| File | Change |
|---|---|
| `packages/handlers/src/handlers/python-script.ts` | Extend `buildLineHandler` to parse progress lines |
| `packages/queue/src/` | Add `updateStepProgress(stepRunId, percent)` SQL helper |

---

## Files to Modify / Create

```
packages/handlers/
└── src/
    └── handlers/
        └── python-script.ts       # [MODIFY] parse __PROGRESS__ in line handler

packages/queue/
└── src/
    └── progress-updater.ts        # [NEW] updateStepProgress(pool, stepRunId, percent)
```

---

## Implementation

### `updateStepProgress` (in `packages/queue`)

```ts
// packages/queue/src/progress-updater.ts
import type { Pool } from 'pg';

/**
 * Atomically sets step_runs.progress for a step that is still RUNNING.
 * No-ops if the step has already moved out of RUNNING (lease lost or completed).
 */
export async function updateStepProgress(
  pool: Pool,
  stepRunId: string,
  percent: number,
): Promise<void> {
  await pool.query(
    `UPDATE step_runs
     SET progress = $1
     WHERE id = $2 AND status = 'RUNNING'`,
    [Math.min(100, Math.max(0, Math.round(percent))), stepRunId],
  );
}
```

Export from `packages/queue/src/index.ts`.

### Extend `buildLineHandler` in `python-script.ts`

```ts
const PROGRESS_PREFIX = '__PROGRESS__';

// Inside the write() method of the Transform stream:
if (trimmed.startsWith(PROGRESS_PREFIX)) {
  const jsonPart = trimmed.slice(PROGRESS_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as { percent?: unknown; stage?: unknown };
    const percent = typeof parsed.percent === 'number' ? parsed.percent : null;

    if (percent === null) {
      logger.warn({ line: trimmed }, '__PROGRESS__ line missing numeric percent — skipping');
    } else {
      // Fire-and-forget DB update + Redis publish
      updateStepProgress(pool, stepRunId, percent).catch((err) =>
        logger.error({ err }, 'Failed to update step progress'),
      );

      publishStepEvent({
        type: 'step.progress',
        stepRunId,
        payload: {
          percent,
          stage: typeof parsed.stage === 'string' ? parsed.stage : undefined,
        },
      }).catch((err) => logger.error({ err }, 'Failed to publish progress event'));
    }
  } catch {
    logger.warn({ line: trimmed }, '__PROGRESS__ line has invalid JSON — skipping');
  }
  // Either way: do NOT write to step_logs
  continue;
}
```

### Redis Event Schema

```ts
publishStepEvent({
  type: 'step.progress',
  stepRunId: string,
  payload: {
    percent: number,       // 0–100
    stage?: string,        // optional human-readable stage label
  },
})
```

---

## Python Convention (for script authors)

```python
import json
import sys

def report_progress(percent: int, stage: str = "") -> None:
    """
    Report execution progress back to FlowForge.
    This line is intercepted by the worker stream parser.
    """
    print(f"__PROGRESS__ {json.dumps({'percent': percent, 'stage': stage})}", flush=True)

# Example usage:
report_progress(25, "Loading data")
# ... work ...
report_progress(75, "Processing embeddings")
# ... work ...
report_progress(100, "Done")
```

---

## Verification Checklist

- [ ] Script printing `__PROGRESS__ {"percent": 40, "stage": "step1"}` sets
      `step_runs.progress = 40` in PostgreSQL while the container is running.
- [ ] Script printing `__PROGRESS__ {"percent": 75}` (no `stage`) sets
      `step_runs.progress = 75`. No warning is logged for the missing `stage`.
- [ ] Script printing `__PROGRESS__ not-valid-json` logs a warning and does
      NOT crash or insert into `step_logs`.
- [ ] Script printing `__PROGRESS__ {"stage": "no-percent"}` (missing `percent`)
      logs a warning and does NOT update the DB.
- [ ] The Redis channel `flowforge:events:step:{stepRunId}` receives a
      `step.progress` event with `payload.percent = 75`.
- [ ] ReactFlow DAG node progress bar updates in real time in the dashboard.
- [ ] `__PROGRESS__` lines do NOT appear in `step_logs` (verified from Unit 05).
- [ ] `updateStepProgress` is exported from `packages/queue/src/index.ts`.
- [ ] `tsc --noEmit` exits 0 across the full monorepo.
- [ ] Only `packages/handlers/` and `packages/queue/` files are modified.
