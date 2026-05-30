import type { StepEvent } from '@flowforge/shared';
import { subscriber } from './redis-client.js';
import { runChannel, CHANNEL_GLOBAL } from './channels.js';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'events-subscribe',
});

export type EventCallback = (event: StepEvent) => void;

export async function subscribeToRunEvents(
  workflowRunId: string,
  callback: EventCallback,
): Promise<() => Promise<void>> {
  const channel = runChannel(workflowRunId);

  const messageHandler = (ch: string, message: string) => {
    if (ch !== channel) return;
    try {
      const event = JSON.parse(message) as StepEvent;
      callback(event);
    } catch {
      logger.warn({ message }, 'Failed to parse Redis event');
    }
  };

  subscriber.on('message', messageHandler);
  await subscriber.subscribe(channel);

  // Return unsubscribe function
  return async () => {
    subscriber.off('message', messageHandler);
    await subscriber.unsubscribe(channel);
  };
}

export async function subscribeToGlobalEvents(
  callback: EventCallback,
): Promise<() => Promise<void>> {
  const messageHandler = (ch: string, message: string) => {
    if (ch !== CHANNEL_GLOBAL) return;
    try {
      const event = JSON.parse(message) as StepEvent;
      callback(event);
    } catch {
      /* ignore parse errors in global stream to keep it clean */
    }
  };

  subscriber.on('message', messageHandler);
  await subscriber.subscribe(CHANNEL_GLOBAL);

  return async () => {
    subscriber.off('message', messageHandler);
    await subscriber.unsubscribe(CHANNEL_GLOBAL);
  };
}
