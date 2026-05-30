import type { StepEvent } from '@flowforge/shared';
import { publisher } from './redis-client.js';
import { runChannel, CHANNEL_GLOBAL } from './channels.js';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'events-publish',
});

export async function publishStepEvent(event: StepEvent): Promise<void> {
  const channel = runChannel(event.workflowRunId);
  const payload = JSON.stringify(event);

  try {
    await publisher.publish(channel, payload);
    await publisher.publish(CHANNEL_GLOBAL, payload); // for dashboard global view
  } catch (err) {
    // Fire-and-forget — never throw. Dashboard recovers via REST.
    logger.warn({ err, event }, 'Failed to publish step event to Redis');
  }
}
