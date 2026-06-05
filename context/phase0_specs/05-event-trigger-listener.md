# Unit 05 — Event Trigger Listener (Redis Pub/Sub)

> **Phase**: Phase 0 — Trigger Subsystem  
> **System Boundary**: `packages/api/` + `packages/events/` (extend existing packages)  
> **Depends On**: Unit 01 (trigger schema), Unit 02 (`@flowforge/trigger`), Unit 09 Phase 0 (`@flowforge/events` Redis client)

---

## What This Unit Builds

An event trigger listener that subscribes to a Redis channel and fires matching `event`-type triggers when messages arrive. This allows internal FlowForge events (or external systems publishing to Redis) to trigger workflows without an HTTP round-trip.

**Visible result**: Publish a message to `flowforge:external:order.created` in Redis → a matching `ACTIVE` event trigger fires → a new `workflow_run` appears in the DB.

---

## Event Channel Convention

All triggerable events are published to:

```
flowforge:external:<event_type>
```

Where `event_type` matches `config->>'event_type'` in the `workflow_triggers` table.

Examples:
| `event_type` | Redis Channel |
|---|---|
| `order.created` | `flowforge:external:order.created` |
| `payment.failed` | `flowforge:external:payment.failed` |
| `user.signup` | `flowforge:external:user.signup` |

---

## Files To Create / Modify

### [NEW] `packages/api/src/event-trigger-listener.ts`

```typescript
import type { Pool } from 'pg';
import { getRedisSubscriber } from '@flowforge/events';
import { triggerWorkflow } from '@flowforge/trigger';

const EVENT_CHANNEL_PREFIX = 'flowforge:external:';

/**
 * Subscribes to all Redis event trigger channels and fires matching
 * ACTIVE event triggers when a message is published.
 *
 * One listener per event_type — we use Redis pattern subscribe (PSUBSCRIBE)
 * to match all `flowforge:external:*` channels with a single connection.
 */
export async function startEventTriggerListener(pool: Pool): Promise<() => Promise<void>> {
  const subscriber = getRedisSubscriber();

  await subscriber.psubscribe(`${EVENT_CHANNEL_PREFIX}*`);

  subscriber.on('pmessage', async (_pattern: string, channel: string, rawMessage: string) => {
    const eventType = channel.slice(EVENT_CHANNEL_PREFIX.length);
    if (!eventType) return;

    let payload: Record<string, unknown>;
    let deliveryId: string | undefined;

    try {
      const parsed = JSON.parse(rawMessage) as {
        payload?: Record<string, unknown>;
        delivery_id?: string;
        [key: string]: unknown;
      };
      // Support structured envelope { payload, delivery_id } or flat payload
      payload = parsed.payload ?? parsed;
      deliveryId = parsed.delivery_id;
    } catch {
      // Non-JSON message — treat raw string as payload
      payload = { raw: rawMessage };
    }

    // Find all ACTIVE event triggers matching this event_type
    let triggers: Array<{ id: string; workflow_id: string }>;
    try {
      const res = await pool.query<{ id: string; workflow_id: string }>(
        `SELECT id, workflow_id
         FROM workflow_triggers
         WHERE type = 'event'
           AND status = 'ACTIVE'
           AND config->>'event_type' = $1`,
        [eventType]
      );
      triggers = res.rows;
    } catch (err) {
      console.error(`[event-trigger] DB lookup failed for event_type=${eventType}:`, err);
      return;
    }

    // Fire all matching triggers (fan-out)
    for (const trigger of triggers) {
      try {
        await triggerWorkflow(pool, {
          triggerId: trigger.id,
          workflowId: trigger.workflow_id,
          payload,
          idempotencyKey: deliveryId,
          sourceType: 'event',
          userId: 'system:event',
        });
      } catch (err) {
        console.error(`[event-trigger] Failed to fire trigger ${trigger.id}:`, err);
      }
    }
  });

  // Return a teardown function for graceful shutdown
  return async () => {
    await subscriber.punsubscribe(`${EVENT_CHANNEL_PREFIX}*`);
    await subscriber.quit();
  };
}
```

### [MODIFY] `packages/events/src/index.ts`

Expose `getRedisSubscriber` for creating dedicated subscriber connections (a subscriber connection cannot be used for regular commands):

```typescript
// Add to existing exports
export { getRedisSubscriber } from './redis-client.js';
```

### [MODIFY] `packages/events/src/redis-client.ts`

Add a factory for subscriber-specific Redis connections:

```typescript
import Redis from 'ioredis';

// Existing publisher/default client...

/**
 * Returns a fresh Redis connection configured for subscribe mode.
 * Subscriber connections are dedicated — they cannot execute other commands.
 * Callers are responsible for calling quit() on teardown.
 */
export function getRedisSubscriber(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: false,
    enableAutoPipelining: false,
  });
}
```

### [MODIFY] `packages/api/src/server.ts`

Start the event trigger listener during API server boot and tear it down on shutdown:

```typescript
import { startEventTriggerListener } from './event-trigger-listener.js';

// Inside buildServer() or the startup block:
const stopEventListener = await startEventTriggerListener(db);

// Inside shutdown / SIGTERM handler (alongside existing teardowns):
await stopEventListener();
```

---

## Message Envelope Format

Publishers may send either format:

### Structured Envelope (recommended — enables idempotency)

```json
{
  "delivery_id": "evt_01HX...",
  "payload": {
    "order_id": "ord_123",
    "customer_id": "cus_456"
  }
}
```

### Flat Payload (simple, no idempotency)

```json
{
  "order_id": "ord_123",
  "customer_id": "cus_456"
}
```

---

## Fan-Out Behavior

Multiple triggers can match the same `event_type`. The listener fires all of them:

```
Redis: PUBLISH flowforge:external:order.created <json>
  → Trigger A (workflowId=x) → triggerWorkflow → run created
  → Trigger B (workflowId=y) → triggerWorkflow → run created
```

Each trigger's `idempotency_key` is scoped to `(trigger_id, delivery_id)` — so the same delivery ID is deduplicated per trigger independently.

---

## Design Decisions

### Why `PSUBSCRIBE` Instead of `SUBSCRIBE` Per Channel?

- Triggers can be created/deleted at runtime. A `SUBSCRIBE` approach would require dynamically managing subscriptions as triggers change.
- `PSUBSCRIBE flowforge:external:*` captures all event types with a single subscription, eliminating any lifecycle coordination.
- Trade-off: The `pmessage` handler must parse `event_type` from the channel name on every message. This is a cheap string operation.

### Why a Dedicated Subscriber Connection?

Redis subscriber connections enter a special mode where they cannot execute regular commands (e.g., `GET`, `SET`). Reusing the shared pool connection for subscriptions would corrupt it for other callers. `getRedisSubscriber()` creates an isolated connection.

### Why Not Cache Trigger Lookups?

In-memory caching of trigger → workflow_id mappings would require cache invalidation on trigger CRUD. For MVP:
- The DB query uses the partial index `idx_workflow_triggers_event`, making it O(log N) not O(N).
- Event triggers are expected to fire much less frequently than job polls.
- Correctness (always seeing the latest trigger status) outweighs the small query overhead.

---

## Verification Checklist

- [ ] `tsc --noEmit` from `packages/api/` exits 0
- [ ] `tsc --noEmit` from `packages/events/` exits 0
- [ ] Start API server with Redis running
- [ ] Insert one `ACTIVE` event trigger: `config = { "event_type": "order.created" }`
- [ ] `redis-cli PUBLISH flowforge:external:order.created '{"order_id":"123"}'`
- [ ] Verify a new `workflow_runs` row is created within 1 second
- [ ] Verify `workflow_trigger_executions` row: `status = 'SUCCEEDED'`, `source_type = 'event'`
- [ ] Publish with `delivery_id`: `'{"delivery_id":"evt_1","payload":{"order_id":"123"}}'`
- [ ] Publish same message again → `workflow_trigger_executions` shows `status = 'DEDUPLICATED'`
- [ ] Set trigger `status = 'PAUSED'` → publish event → no new `workflow_runs` row
- [ ] Insert a second trigger for `order.created` (different workflow) → single publish fires both
- [ ] Stop API server → `punsubscribe` called cleanly (check logs)
