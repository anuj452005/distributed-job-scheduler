import { test, describe } from 'node:test';
import assert from 'node:assert';
import { publisher, subscriber } from './redis-client.js';
import { publishStepEvent } from './publish.js';
import { subscribeToRunEvents, subscribeToGlobalEvents } from './subscribe.js';
import type { StepEvent } from '@flowforge/shared';

describe('Events Package (Redis Pub/Sub) Tests', () => {
  test('publishStepEvent publishes a StepEvent payload without error', async () => {
    const event: StepEvent = {
      type: 'step.succeeded',
      workflowRunId: 'test-run-1',
      stepRunId: 'step-run-abc',
      stepId: 'step-1',
      status: 'SUCCEEDED',
      timestamp: new Date().toISOString(),
    };

    // Should run successfully without throwing
    await publishStepEvent(event);
    assert.ok(true, 'Published step event successfully');
  });

  test('subscribeToRunEvents receives published events in the callback', async () => {
    const runId = 'test-run-2';
    const eventsReceived: StepEvent[] = [];

    const unsubscribe = await subscribeToRunEvents(runId, (event) => {
      eventsReceived.push(event);
    });

    const event: StepEvent = {
      type: 'step.started',
      workflowRunId: runId,
      stepRunId: 'step-run-def',
      stepId: 'step-2',
      status: 'RUNNING',
      timestamp: new Date().toISOString(),
    };

    await publishStepEvent(event);

    // Allow event to propagate
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.strictEqual(eventsReceived.length, 1);
    assert.strictEqual(eventsReceived[0].stepId, 'step-2');

    await unsubscribe();
  });

  test('unsubscribe() function returned by subscribeToRunEvents stops event delivery', async () => {
    const runId = 'test-run-3';
    let receivedCount = 0;

    const unsubscribe = await subscribeToRunEvents(runId, () => {
      receivedCount++;
    });

    const event: StepEvent = {
      type: 'step.queued',
      workflowRunId: runId,
      status: 'QUEUED',
      timestamp: new Date().toISOString(),
    };

    // First publish: should receive
    await publishStepEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(receivedCount, 1);

    // Unsubscribe
    await unsubscribe();

    // Second publish: should NOT receive
    await publishStepEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(receivedCount, 1); // remains 1
  });

  test('subscribeToGlobalEvents receives events from all runs', async () => {
    let globalEventsReceived = 0;

    const unsubscribe = await subscribeToGlobalEvents(() => {
      globalEventsReceived++;
    });

    const event1: StepEvent = {
      type: 'step.succeeded',
      workflowRunId: 'run-101',
      status: 'SUCCEEDED',
      timestamp: new Date().toISOString(),
    };

    const event2: StepEvent = {
      type: 'step.failed',
      workflowRunId: 'run-102',
      status: 'FAILED',
      timestamp: new Date().toISOString(),
    };

    await publishStepEvent(event1);
    await publishStepEvent(event2);

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(globalEventsReceived, 2);

    await unsubscribe();
  });

  test('If Redis is unavailable, publishStepEvent logs a warning and returns without throwing', async () => {
    // Simulate Redis offline by forcing publish to throw
    const originalPublish = publisher.publish;
    publisher.publish = async () => {
      throw new Error('Connection lost');
    };

    try {
      const event: StepEvent = {
        type: 'step.succeeded',
        workflowRunId: 'test-run-offline',
        status: 'SUCCEEDED',
        timestamp: new Date().toISOString(),
      };

      // Must not throw error
      await publishStepEvent(event);
      assert.ok(true, 'publishStepEvent handled Redis failure gracefully');
    } finally {
      publisher.publish = originalPublish;
    }
  });
});
