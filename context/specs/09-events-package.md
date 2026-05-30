# Unit 09 — Events Package (Redis Pub/Sub)

## What This Unit Builds

`packages/events` — the Redis client, publish helpers, channel naming
conventions, and SSE subscription helpers. This package is the only
place Redis is touched in the codebase. It is a fire-and-forget event
bus — no durable state, no source of truth.

**Done looks like:**
- `publishStepEvent(event)` publishes a `StepEvent` JSON payload to a Redis
  Pub/Sub channel and returns without error.
- `subscribeToRunEvents(runId, callback)` receives published events in the
  callback within 1 second of publishing.
- If Redis is unavailable, `publishStepEvent` logs a warning and returns
  without throwing (the system stays functional — dashboard recovers via REST).
- The worker can call `publishStepEvent` after a commit, and a subscriber
  receives the event.

---

## Dependencies

- Unit 01 — Monorepo scaffold.
- Unit 03 — `@flowforge/shared` types (`StepEvent`).

---

## Files to Create

```
packages/events/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # exports: publishStepEvent, subscribeToRunEvents, redis client
    ├── redis-client.ts       # creates publisher and subscriber Redis clients
    ├── channels.ts           # channel naming: flowforge:events:<runId>
    ├── publish.ts            # publishStepEvent()
    └── subscribe.ts          # subscribeToRunEvents(), unsubscribe()
```

---

## Implementation Details

### `redis-client.ts`

Use `ioredis`. Two separate client instances are required: one for
publishing, one for subscribing (a subscribed client cannot publish).

```ts
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const publisher  = new Redis(REDIS_URL, { lazyConnect: true });
export const subscriber = new Redis(REDIS_URL, { lazyConnect: true });

publisher.on('error', (err) => {
  logger.error({ err }, 'Redis publisher error');
});

subscriber.on('error', (err) => {
  logger.error({ err }, 'Redis subscriber error');
});
```

### `channels.ts`

```ts
export const CHANNEL_GLOBAL = 'flowforge:events:global';

export function runChannel(workflowRunId: string): string {
  return `flowforge:events:run:${workflowRunId}`;
}

export function workerHeartbeatKey(workerId: string): string {
  return `flowforge:worker:${workerId}:heartbeat`;
}
```

### `publish.ts`

```ts
import type { StepEvent } from '@flowforge/shared';

export async function publishStepEvent(event: StepEvent): Promise<void> {
  const channel = runChannel(event.workflowRunId);
  const payload = JSON.stringify(event);

  try {
    await publisher.publish(channel, payload);
    await publisher.publish(CHANNEL_GLOBAL, payload);   // for dashboard global view
  } catch (err) {
    // Fire-and-forget — never throw. Dashboard recovers via REST.
    logger.warn({ err, event }, 'Failed to publish step event to Redis');
  }
}
```

### `subscribe.ts`

```ts
export type EventCallback = (event: StepEvent) => void;

export async function subscribeToRunEvents(
  workflowRunId: string,
  callback: EventCallback,
): Promise<() => Promise<void>> {
  const channel = runChannel(workflowRunId);

  subscriber.on('message', (ch, message) => {
    if (ch !== channel) return;
    try {
      const event = JSON.parse(message) as StepEvent;
      callback(event);
    } catch {
      logger.warn({ message }, 'Failed to parse Redis event');
    }
  });

  await subscriber.subscribe(channel);

  // Return unsubscribe function
  return async () => {
    await subscriber.unsubscribe(channel);
  };
}

export async function subscribeToGlobalEvents(
  callback: EventCallback,
): Promise<() => Promise<void>> {
  subscriber.on('message', (ch, message) => {
    if (ch !== CHANNEL_GLOBAL) return;
    try {
      const event = JSON.parse(message) as StepEvent;
      callback(event);
    } catch { /* ignore */ }
  });

  await subscriber.subscribe(CHANNEL_GLOBAL);

  return async () => {
    await subscriber.unsubscribe(CHANNEL_GLOBAL);
  };
}
```

---

## Rules for This Package

- `packages/events` must **not** write any durable state to Redis (no `SET`, no `HSET`
  outside of ephemeral worker heartbeat keys with TTL).
- Never import from `packages/queue`, `packages/engine`, `packages/worker`, or `packages/api`.
- Redis unavailability must never crash the API server or worker. All publish calls
  are wrapped in try/catch.
- The SSE gateway (Unit 15) will import `subscribeToRunEvents` and `subscribeToGlobalEvents`
  from this package.

---

## npm Dependencies

```
ioredis
```

---

## Verification Checklist

- [ ] `publishStepEvent({ type: 'step.succeeded', workflowRunId: 'test-run', ... })`
      publishes without error to a running local Redis.
- [ ] A subscriber set up before the publish receives the event JSON within 1 s.
- [ ] If Redis is not running, `publishStepEvent` logs a warning but does not throw.
- [ ] `unsubscribe()` function returned by `subscribeToRunEvents` stops event delivery.
- [ ] `packages/events` does not import from `packages/queue`, `packages/engine`,
      or `packages/worker`.
- [ ] `tsc --noEmit` exits 0 on `packages/events`.
