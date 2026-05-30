# Unit 15 — SSE Gateway

## What This Unit Builds

`GET /api/events/stream` — a Server-Sent Events endpoint that bridges
Redis Pub/Sub to browser `EventSource` connections. This is what makes
the dashboard update in real time without polling.

**Done looks like:**
- Open `GET /api/events/stream?runId=<id>` in a browser or `curl --no-buffer`.
- Trigger a workflow run and watch `step.started`, `step.succeeded` events
  stream in real time.
- Close the browser tab: the server unsubscribes from Redis (no leak).
- If Redis is unavailable: the SSE connection stays open but receives no events
  (dashboard falls back to REST polling — acceptable).

---

## Dependencies

- Unit 09 — `packages/events` `subscribeToRunEvents()`, `subscribeToGlobalEvents()`.
- Unit 11 — API server with auth.

---

## Files to Create / Modify

```
packages/api/src/routes/
└── events/
    └── stream.ts           # GET /api/events/stream
```

---

## Implementation Details

### Route: `GET /api/events/stream`

Query params:
- `runId` (optional) — subscribe to events for a specific run
- If `runId` is omitted, subscribe to the global channel for all run events

**Required HTTP headers (set on the reply):**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no    ← disables nginx buffering if behind a proxy
```

**SSE event format:**

```
event: step.succeeded
data: {"type":"step.succeeded","workflowRunId":"...","stepRunId":"...","status":"SUCCEEDED","timestamp":"..."}

```

(Two newlines after `data:` terminate the event.)

### Route Handler Logic

```ts
// GET /api/events/stream
app.get('/api/events/stream', { preHandler: [requireAuth] }, async (request, reply) => {
  const { runId } = request.query as { runId?: string };

  // Set SSE headers
  reply.raw.setHeader('Content-Type',  'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection',    'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
  reply.raw.flushHeaders();

  // Helper to write an SSE event
  function sendEvent(event: StepEvent): void {
    reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  // Subscribe to Redis channel
  const unsubscribe = runId
    ? await subscribeToRunEvents(runId, sendEvent)
    : await subscribeToGlobalEvents(sendEvent);

  // Keep-alive ping every 30 s (prevents proxy timeouts)
  const pingTimer = setInterval(() => {
    reply.raw.write(': ping\n\n');
  }, 30_000);

  // Cleanup on client disconnect
  request.raw.on('close', async () => {
    clearInterval(pingTimer);
    await unsubscribe();
    reply.raw.end();
  });

  // Do not call reply.send() — we control the stream manually
});
```

### Why Not `fastify-sse-v2` or a Plugin?

The SSE spec is simple enough to implement directly with `reply.raw`. Using
`reply.raw` avoids framework overhead and gives precise control over flush
timing. This approach is compatible with the `keepAliveTimeout` settings.

### Fastify Configuration

Set a long `connectionTimeout` on the Fastify instance to prevent
keep-alive SSE connections from being terminated:

```ts
const app = Fastify({
  connectionTimeout: 0,   // 0 = no timeout (SSE connections are long-lived)
  logger: true,
});
```

---

## Dashboard Integration Pattern (documented here for reference)

The dashboard (Unit 17–20) must follow this pattern:

1. On page load: `GET /api/runs/:id` — fetch full state.
2. Open `EventSource` to `GET /api/events/stream?runId=<id>`.
3. On SSE event: merge the delta into local state (update only the changed
   step/run, do not replace the entire state).
4. On SSE `error` / reconnect: re-fetch full state from `GET /api/runs/:id`
   before re-opening the stream.

The dashboard must **never** replace full state from SSE alone. SSE events
are deltas; the REST API is the ground truth.

---

## Verification Checklist

- [ ] `curl -N "http://localhost:3000/api/events/stream?runId=<id>" \
       -H "Authorization: Bearer <token>"` — stays open and streams events.
- [ ] Trigger a 2-step workflow and observe `step.queued`, `step.started`,
      `step.succeeded` events arrive in the curl session within 3 s of each event.
- [ ] Closing the `curl` connection → server logs unsubscribed from Redis channel.
- [ ] No Authorization header → `401` before the SSE stream opens.
- [ ] Global stream (no `runId`) receives events from all runs.
- [ ] If Redis is down: stream stays open, receives only the keep-alive ping
      comments (`: ping`) every 30 s.
- [ ] Multiple concurrent SSE connections to the same `runId` all receive events.
- [ ] `tsc --noEmit` exits 0 on `packages/api`.
