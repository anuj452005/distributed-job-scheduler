# Unit 21 — Structured Logging & Secret Redaction

## What This Unit Builds

Pino-based structured logging wired to every step execution, with all
logs persisted to the `step_logs` PostgreSQL table. Secret fields are
redacted before persistence. The log viewer in the dashboard reads these
entries.

**Done looks like:**
- Run a workflow that uses a `connectionRef`. After the run, query the
  `step_logs` table. No row contains the value of any credential in
  `connection_refs`.
- The `step_logs` table has entries for each step execution at appropriate
  log levels (INFO for start/end, ERROR for failures).
- `GET /api/steps/:id/logs` returns the step's structured logs.
- The LogViewer in the dashboard (Unit 19) renders them with level colours.

---

## Dependencies

- Unit 02 — `step_logs` table exists.
- Unit 04 — `packages/db` pool.
- Unit 07 — Worker process (to wire the logger).
- Unit 11 — API server (for the logs route).
- Unit 19 — Dashboard LogViewer component (to consume the logs).

---

## Files to Create / Modify

```
packages/worker/src/
└── logger.ts                  # creates Pino root logger + step child loggers

packages/api/src/
├── routes/
│   └── steps/
│       └── logs.ts            # GET /api/steps/:id/logs
└── services/
    └── log-service.ts         # insertStepLog(), getStepLogs()

packages/shared/src/
└── redaction.ts               # getRedactedKeys(), redactPayload()
```

---

## Pino Logger Setup (`packages/worker/src/logger.ts`)

```ts
import pino from 'pino';

export const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Create a child logger bound to a specific step run
export function createStepLogger(stepRunId: string, workflowRunId: string) {
  return rootLogger.child({ stepRunId, workflowRunId });
}
```

The `logger` passed in `StepContext` (Unit 03) is this child logger. Handlers
call `ctx.logger.info(...)`, `ctx.logger.error(...)`, etc.

---

## Log Persistence

After each log line emitted by a handler, persist it to `step_logs`. Use
a Pino destination stream that intercepts log entries and writes them to
the database:

```ts
// Pino stream that writes to step_logs
class StepLogStream extends Writable {
  _write(chunk: Buffer, _enc: string, callback: () => void) {
    const entry = JSON.parse(chunk.toString());
    const { level, msg, stepRunId, time, ...metadata } = entry;

    // Redact secrets before persistence
    const safeMetadata = redactPayload(metadata, redactedKeys);

    pool.query(
      `INSERT INTO step_logs (step_run_id, level, message, metadata, created_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
      [stepRunId, levelLabel(level), msg, safeMetadata, time],
    ).catch(err => rootLogger.error({ err }, 'Failed to persist step log'));

    callback();
  }
}
```

Only persist logs that have a `stepRunId` field (i.e., step-context logs).
Worker-level logs without a `stepRunId` are written to stdout only.

---

## Secret Redaction (`packages/shared/src/redaction.ts`)

**INVARIANT:** Raw secrets must never appear in `step_logs`, `step_runs`,
or `workflow_steps` (architecture.md invariant #4).

```ts
// Keys to always redact from any log metadata object
const ALWAYS_REDACT = [
  'password', 'secret', 'token', 'apiKey', 'api_key',
  'connectionString', 'connection_string', 'accessKey', 'privateKey',
];

// Redact keys that match known connection_refs names or always-redact list
export function redactPayload(
  obj: Record<string, unknown>,
  connectionRefNames: string[],   // fetched from connection_refs table at startup
): Record<string, unknown> {
  const redactKeys = new Set([...ALWAYS_REDACT, ...connectionRefNames]);
  return deepRedact(obj, redactKeys);
}

function deepRedact(obj: unknown, keys: Set<string>): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(item => deepRedact(item, keys));

  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
      k,
      keys.has(k.toLowerCase()) ? '[REDACTED]' : deepRedact(v, keys),
    ]),
  );
}
```

Load `connectionRefNames` from the DB at worker startup and refresh every 5 min.

---

## Logs API Route

### `GET /api/steps/:id/logs`

```ts
// Query params: ?limit=100&offset=0&level=ERROR
// Returns step logs paginated and filtered
{
  data: {
    items: Array<{
      id:        string;
      level:     string;
      message:   string;
      metadata:  Record<string, unknown>;
      createdAt: string;
    }>;
    total: number;
  }
}
```

Add this route to the existing routes in `packages/api`.

---

## Retention Policy (documented, not implemented in MVP)

Per `project-overview.md`: 7–30 day retention. In MVP, document a `TODO`:

```ts
// TODO(ops): Add a scheduled job to DELETE FROM step_logs
//            WHERE created_at < NOW() - INTERVAL '30 days'
//            Run daily via a cron trigger (V2 scheduler feature).
```

---

## Verification Checklist

- [ ] Run a workflow that uses `connectionRef: "postgres-warehouse"`. Query
      `step_logs` — no row contains the string "postgres-warehouse" as a value
      (only as a reference name is acceptable), and no row contains any
      connection password or secret.
- [ ] `step_logs` table has INFO rows for step start and step end events.
- [ ] `step_logs` has an ERROR row when a step fails with an exception.
- [ ] `GET /api/steps/:id/logs` returns logs for the step in chronological order.
- [ ] Log level filter `?level=ERROR` returns only ERROR rows.
- [ ] `deepRedact` unit test: object `{ password: "s3cr3t", name: "ok" }` →
      `{ password: "[REDACTED]", name: "ok" }`.
- [ ] `deepRedact` handles nested objects and arrays without throwing.
- [ ] LogViewer in the dashboard displays log lines with correct level colours.
- [ ] `tsc --noEmit` exits 0 on all modified packages.
