# Phase 1 — Unit 05: Live Log Streaming

## What This Unit Builds

Attaches to the Docker container's stdout/stderr stream immediately after
`container.start()` and processes each line in real time:

1. **Every plain log line** is written as a row to `step_logs` in PostgreSQL
   AND published to the Redis Pub/Sub channel
   `flowforge:events:step:{stepRunId}` so the SSE gateway can push it to the
   dashboard console viewer.
2. The stream attachment is non-blocking — it runs concurrently with the
   container's execution and does not delay the heartbeat loop or the
   `container.wait()` call.
3. **`__PROGRESS__`-prefixed lines are filtered out here** — they are not
   written to `step_logs` as raw strings (they are handled in Unit 06).

**Done looks like:**
- A Python script that prints `print("hello from script")` produces a row in
  `step_logs` with `message = "hello from script"` and `level = 'INFO'` while
  the container is still running.
- The log line appears in the React dashboard's live console within 3 seconds
  of `print()` executing (Success Criterion 5).
- The `step_logs` table does not contain raw `__PROGRESS__ ...` lines.

---

## Dependencies

- Foundation Unit 09 — `@flowforge/events` publish helper (`publishStepEvent`)
  and Redis client are implemented.
- Phase 1 Unit 03 — Container create/start/wait lifecycle implemented.
- Phase 1 Unit 04 — Non-blocking async execution in poll loop.

---

## System Boundary

Changes are confined to:

| File | Change |
|---|---|
| `packages/handlers/src/handlers/python-script.ts` | Add `attachLogStream()` called after `container.start()` |
| `packages/queue/src/` | Add `insertStepLog()` SQL helper if not already present |

Do **not** modify SSE routes or the dashboard in this unit.

---

## Files to Modify / Create

```
packages/handlers/
└── src/
    └── handlers/
        └── python-script.ts       # [MODIFY] attach log stream after start()

packages/queue/
└── src/
    └── log-inserter.ts            # [NEW] insertStepLog(stepRunId, level, message)
```

---

## Implementation

### `insertStepLog` (in `packages/queue`)

```ts
// packages/queue/src/log-inserter.ts
import type { Pool } from 'pg';

export async function insertStepLog(
  pool: Pool,
  stepRunId: string,
  level: 'INFO' | 'ERROR',
  message: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO step_logs (step_run_id, level, message, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [stepRunId, level, message],
  );
}
```

Export from `packages/queue/src/index.ts`.

### Log Stream Attachment (`python-script.ts`)

```ts
import { publishStepEvent } from '@flowforge/events';

const PROGRESS_PREFIX = '__PROGRESS__';

async function attachLogStream(
  container: Docker.Container,
  stepRunId: string,
  pool: Pool,
  logger: StepContext['logger'],
): Promise<void> {
  const logStream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true,
  });

  // Dockerode's modem.demuxStream splits multiplexed stdout/stderr
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  container.modem.demuxStream(
    logStream,
    buildLineHandler(stepRunId, 'INFO',  pool, logger),
    buildLineHandler(stepRunId, 'ERROR', pool, logger),
  );
}

function buildLineHandler(
  stepRunId: string,
  level: 'INFO' | 'ERROR',
  pool: Pool,
  logger: StepContext['logger'],
): NodeJS.WritableStream {
  // Use a simple line-splitting Transform so we process one line at a time
  const { Transform } = await import('stream');
  let buffer = '';

  return new Transform({
    write(chunk: Buffer, _enc, cb) {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';  // last element may be incomplete

      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (!trimmed) continue;

        // Skip __PROGRESS__ lines — handled in Unit 06
        if (trimmed.startsWith(PROGRESS_PREFIX)) continue;

        // Fire-and-forget DB insert and Redis publish
        insertStepLog(pool, stepRunId, level, trimmed).catch((err) =>
          logger.error({ err }, 'Failed to insert step log'),
        );

        publishStepEvent({
          type: 'step.log',
          stepRunId,
          payload: { level, message: trimmed },
        }).catch((err) => logger.error({ err }, 'Failed to publish log event'));
      }

      cb();
    },
  });
}
```

### Wiring into `runContainer`

```ts
// After container.start():
attachLogStream(container, ctx.stepRunId, pool, ctx.logger)
  .catch((err) => ctx.logger.error({ err }, 'Log stream attach failed'));

// Then await container.wait() as before
const result = await container.wait();
```

The stream runs as a fire-and-forget Promise. The `container.wait()` call
blocks the `executeStep` Promise until the container exits.

---

## Redis Event Schema

```ts
publishStepEvent({
  type: 'step.log',
  stepRunId: string,
  payload: {
    level: 'INFO' | 'ERROR',
    message: string,
  },
})
```

The SSE gateway subscribes to `flowforge:events:step:{stepRunId}` and pushes
these events to the browser's `EventSource` connection.

---

## Verification Checklist

- [ ] A script with `print("hello")` inserts exactly one row in `step_logs`
      with `message = "hello"` and `level = 'INFO'`.
- [ ] A script with `import sys; print("err", file=sys.stderr)` inserts a row
      with `level = 'ERROR'`.
- [ ] A `__PROGRESS__` line does **not** appear in `step_logs`.
- [ ] Log rows appear in `step_logs` before `container.wait()` resolves (i.e.,
      before the container has fully exited).
- [ ] The Redis channel `flowforge:events:step:{stepRunId}` receives
      `step.log` events while the container is running.
- [ ] The dashboard live console shows log lines within 3 seconds of `print()`
      executing (Success Criterion 5).
- [ ] `insertStepLog` is exported from `packages/queue/src/index.ts`.
- [ ] No secrets or connection strings appear in any log row.
- [ ] `tsc --noEmit` exits 0 across the full monorepo.
- [ ] Only `packages/handlers/` and `packages/queue/` files are modified.
