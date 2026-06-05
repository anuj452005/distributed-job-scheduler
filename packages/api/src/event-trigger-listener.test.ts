import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { FastifyInstance } from 'fastify';
import { pool } from '@flowforge/db';
import { publisher } from '@flowforge/events';
import crypto from 'crypto';

describe('Event Trigger Listener Integration Tests', () => {
  let app: FastifyInstance;
  const createdWorkflowIds: string[] = [];
  const createdTriggerIds: string[] = [];

  before(async () => {
    // Populate env variables for test mode
    process.env.NODE_ENV = 'test';
    process.env.CLERK_SECRET_KEY = 'sk_test_mock_secret_key';
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_mock_publishable_key';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@localhost:5432/mock?sslmode=disable';
    process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

    // Dynamically import buildServer
    const { buildServer } = await import('./server.js');
    app = await buildServer();
  });

  after(async () => {
    // 1. Close Fastify app first to unsubscribe and stop receiving any new Redis events
    if (app) {
      await app.close();
    }

    // 2. Give background tasks a brief moment to yield and finish
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 3. Cleanup database rows in correct dependency order
    if (createdTriggerIds.length > 0) {
      await pool.query(
        `DELETE FROM workflow_trigger_executions WHERE trigger_id = ANY($1)`,
        [createdTriggerIds]
      );
      await pool.query(
        `DELETE FROM workflow_triggers WHERE id = ANY($1)`,
        [createdTriggerIds]
      );
    }

    if (createdWorkflowIds.length > 0) {
      await pool.query(
        `DELETE FROM workflow_runs WHERE workflow_id = ANY($1)`,
        [createdWorkflowIds]
      );
      await pool.query(
        `DELETE FROM workflows WHERE id = ANY($1)`,
        [createdWorkflowIds]
      );
    }

    await pool.end();
  });

  // Helper to poll for trigger execution status in DB
  async function pollTriggerExecution(triggerId: string, expectedStatus: 'SUCCEEDED' | 'FAILED' | 'DEDUPLICATED', idempotencyKey?: string): Promise<any> {
    const maxAttempts = 150;
    const intervalMs = 100;
    for (let i = 0; i < maxAttempts; i++) {
      const res = await pool.query(
        `SELECT id, status, payload, workflow_run_id, idempotency_key
         FROM workflow_trigger_executions
         WHERE trigger_id = $1`,
        [triggerId]
      );
      const match = res.rows.find(row => {
        if (row.status !== expectedStatus) return false;
        if (idempotencyKey !== undefined && row.idempotency_key !== idempotencyKey) return false;
        return true;
      });
      if (match) {
        return match;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timed out waiting for trigger execution status ${expectedStatus} for trigger ${triggerId}`);
  }

  test('Publish matching ACTIVE trigger event -> creates workflow_run & execution status SUCCEEDED', async () => {
    // 1. Create workflow & step
    const workflowId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflows (id, name, created_by) VALUES ($1, $2, $3)`,
      [workflowId, 'Event Trigger Workflow 1', 'system:event']
    );
    createdWorkflowIds.push(workflowId);

    const stepId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
       VALUES ($1, $2, 'step-1', 'http-request', '{}', '{"maxAttempts":3,"baseDelayMs":1000}', 30)`,
      [stepId, workflowId]
    );

    // 2. Create ACTIVE event trigger
    const triggerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, created_by, updated_by)
       VALUES ($1, $2, 'Order Created Event', 'event', 'ACTIVE', $3, 'system:event', 'system:event')`,
      [triggerId, workflowId, JSON.stringify({ event_type: 'order.created' })]
    );
    createdTriggerIds.push(triggerId);

    // 3. Publish simple JSON payload to channel
    const payload = { order_id: 'order_123', total: 100 };
    await publisher.publish('flowforge:external:order.created', JSON.stringify(payload));

    // 4. Poll and verify trigger executions
    const execRow = await pollTriggerExecution(triggerId, 'SUCCEEDED');
    assert.deepStrictEqual(execRow.payload, payload);
    assert.ok(execRow.workflow_run_id);

    // 5. Verify workflow runs
    const runRes = await pool.query(
      `SELECT id, status, input_payload
       FROM workflow_runs
       WHERE id = $1`,
      [execRow.workflow_run_id]
    );
    assert.strictEqual(runRes.rows.length, 1);
    assert.deepStrictEqual(runRes.rows[0].input_payload, payload);
  });

  test('Publish matching ACTIVE trigger event with envelope -> idempotency / deduplication checks', async () => {
    const workflowId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflows (id, name, created_by) VALUES ($1, $2, $3)`,
      [workflowId, 'Event Trigger Workflow 2', 'system:event']
    );
    createdWorkflowIds.push(workflowId);

    const stepId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
       VALUES ($1, $2, 'step-1', 'http-request', '{}', '{"maxAttempts":3,"baseDelayMs":1000}', 30)`,
      [stepId, workflowId]
    );

    const triggerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, created_by, updated_by)
       VALUES ($1, $2, 'Payment Failed Event', 'event', 'ACTIVE', $3, 'system:event', 'system:event')`,
      [triggerId, workflowId, JSON.stringify({ event_type: 'payment.failed' })]
    );
    createdTriggerIds.push(triggerId);

    const deliveryIdA = `payment_fail_evt_A_${crypto.randomUUID()}`;
    const deliveryIdB = `payment_fail_evt_B_${crypto.randomUUID()}`;

    // Event 1: Unique deliveryIdA
    const payloadEnvelope1 = {
      delivery_id: deliveryIdA,
      payload: { invoice_id: 'inv_abc', amount: 100 }
    };

    // Event 2: Duplicate deliveryIdA (to be deduplicated)
    const payloadEnvelope2 = {
      delivery_id: deliveryIdA,
      payload: { invoice_id: 'inv_abc', amount: 100 }
    };

    // Event 3: Unique deliveryIdB (to act as synchronization barrier)
    const payloadEnvelope3 = {
      delivery_id: deliveryIdB,
      payload: { invoice_id: 'inv_def', amount: 200 }
    };

    // 1. Publish Event 1
    await publisher.publish('flowforge:external:payment.failed', JSON.stringify(payloadEnvelope1));
    const execRow1 = await pollTriggerExecution(triggerId, 'SUCCEEDED', deliveryIdA);
    assert.ok(execRow1.workflow_run_id);

    // 2. Publish Event 2 (duplicate) followed immediately by Event 3 (new unique)
    await publisher.publish('flowforge:external:payment.failed', JSON.stringify(payloadEnvelope2));
    await publisher.publish('flowforge:external:payment.failed', JSON.stringify(payloadEnvelope3));

    // 3. Poll for Event 3 to succeed. This guarantees Event 2 has already been processed and skipped.
    const execRow3 = await pollTriggerExecution(triggerId, 'SUCCEEDED', deliveryIdB);
    assert.ok(execRow3.workflow_run_id);

    // 4. Verify no new workflow run was created for the duplicate event (Event 2).
    // We expect exactly 2 runs: one for Event 1 (deliveryIdA) and one for Event 3 (deliveryIdB).
    const totalRunsRes = await pool.query(
      `SELECT count(*)::int as count FROM workflow_runs WHERE workflow_id = $1`,
      [workflowId]
    );
    assert.strictEqual(totalRunsRes.rows[0].count, 2);

    // Verify trigger executions database table contains only Event 1 and Event 3 as successful entries
    const executionsRes = await pool.query(
      `SELECT status, idempotency_key FROM workflow_trigger_executions WHERE trigger_id = $1 ORDER BY created_at ASC`,
      [triggerId]
    );
    // There should be exactly 2 rows in the DB because Event 2 triggered a conflict and was skipped without inserting.
    assert.strictEqual(executionsRes.rows.length, 2);
    assert.strictEqual(executionsRes.rows[0].idempotency_key, deliveryIdA);
    assert.strictEqual(executionsRes.rows[1].idempotency_key, deliveryIdB);
  });

  test('Publish matching PAUSED event trigger -> does not trigger workflow run', async () => {
    const workflowId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflows (id, name, created_by) VALUES ($1, $2, $3)`,
      [workflowId, 'Event Trigger Workflow 3', 'system:event']
    );
    createdWorkflowIds.push(workflowId);

    const stepId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
       VALUES ($1, $2, 'step-1', 'http-request', '{}', '{"maxAttempts":3,"baseDelayMs":1000}', 30)`,
      [stepId, workflowId]
    );

    const triggerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, created_by, updated_by)
       VALUES ($1, $2, 'User Signup Event', 'event', 'PAUSED', $3, 'system:event', 'system:event')`,
      [triggerId, workflowId, JSON.stringify({ event_type: 'user.signup' })]
    );
    createdTriggerIds.push(triggerId);

    // Publish to channel
    await publisher.publish('flowforge:external:user.signup', JSON.stringify({ user_id: 'usr_123' }));
    
    // Give it a brief moment
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Verify no trigger execution row was created
    const execRes = await pool.query(
      `SELECT id FROM workflow_trigger_executions WHERE trigger_id = $1`,
      [triggerId]
    );
    assert.strictEqual(execRes.rows.length, 0);

    // Verify no workflow run was created
    const runRes = await pool.query(
      `SELECT id FROM workflow_runs WHERE workflow_id = $1`,
      [workflowId]
    );
    assert.strictEqual(runRes.rows.length, 0);
  });

  test('Publish matching ACTIVE event trigger with multiple triggers (fan-out) -> triggers both workflows', async () => {
    // 1. Setup workflow A
    const workflowIdA = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflows (id, name, created_by) VALUES ($1, $2, $3)`,
      [workflowIdA, 'Fan-out Workflow A', 'system:event']
    );
    createdWorkflowIds.push(workflowIdA);

    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
       VALUES ($1, $2, 'step-1', 'http-request', '{}', '{"maxAttempts":3,"baseDelayMs":1000}', 30)`,
      [crypto.randomUUID(), workflowIdA]
    );

    const triggerIdA = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, created_by, updated_by)
       VALUES ($1, $2, 'A Event', 'event', 'ACTIVE', $3, 'system:event', 'system:event')`,
      [triggerIdA, workflowIdA, JSON.stringify({ event_type: 'item.created' })]
    );
    createdTriggerIds.push(triggerIdA);

    // 2. Setup workflow B
    const workflowIdB = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflows (id, name, created_by) VALUES ($1, $2, $3)`,
      [workflowIdB, 'Fan-out Workflow B', 'system:event']
    );
    createdWorkflowIds.push(workflowIdB);

    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
       VALUES ($1, $2, 'step-1', 'http-request', '{}', '{"maxAttempts":3,"baseDelayMs":1000}', 30)`,
      [crypto.randomUUID(), workflowIdB]
    );

    const triggerIdB = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, created_by, updated_by)
       VALUES ($1, $2, 'B Event', 'event', 'ACTIVE', $3, 'system:event', 'system:event')`,
      [triggerIdB, workflowIdB, JSON.stringify({ event_type: 'item.created' })]
    );
    createdTriggerIds.push(triggerIdB);

    // 3. Publish to item.created
    const payload = { item_id: 'xyz-999' };
    await publisher.publish('flowforge:external:item.created', JSON.stringify(payload));

    // 4. Poll and verify trigger executions for A
    const execRowA = await pollTriggerExecution(triggerIdA, 'SUCCEEDED');
    assert.ok(execRowA.workflow_run_id);

    // 5. Poll and verify trigger executions for B
    const execRowB = await pollTriggerExecution(triggerIdB, 'SUCCEEDED');
    assert.ok(execRowB.workflow_run_id);
  });
});
