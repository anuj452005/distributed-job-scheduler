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
      payload = (parsed.payload && typeof parsed.payload === 'object' && !Array.isArray(parsed.payload))
        ? (parsed.payload as Record<string, unknown>)
        : parsed;
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
