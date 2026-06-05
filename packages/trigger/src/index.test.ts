import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { pool } from '@flowforge/db';
import crypto from 'crypto';
import { triggerWorkflow } from './index.js';

describe('Trigger Package Integration Tests', () => {
  let workflowId: string;
  let triggerId: string;
  let stepId: string;
  const testUser = 'trigger-test-user';

  before(async () => {
    workflowId = crypto.randomUUID();
    triggerId = crypto.randomUUID();
    stepId = crypto.randomUUID();

    // 1. Create a dummy workflow
    await pool.query(
      `INSERT INTO workflows (id, name, created_by) VALUES ($1, $2, $3)`,
      [workflowId, 'Trigger Test Workflow', testUser]
    );

    // 2. Create a step (createWorkflowRun requires at least one step)
    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [stepId, workflowId, 'step1', 'transform-json', '{}', '{"maxAttempts": 3, "baseDelayMs": 1000}', 30]
    );

    // 3. Create a workflow trigger
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, created_by, updated_by)
       VALUES ($1, $2, $3, 'webhook', 'ACTIVE', $4, $4)`,
      [triggerId, workflowId, 'Test Webhook Trigger', testUser]
    );
  });

  after(async () => {
    // Clean up all data associated with this test session
    try {
      await pool.query(`DELETE FROM workflow_trigger_executions WHERE trigger_id = $1`, [triggerId]);
      await pool.query(`DELETE FROM workflow_runs WHERE workflow_id = $1`, [workflowId]);
      await pool.query(`DELETE FROM workflow_triggers WHERE id = $1`, [triggerId]);
      await pool.query(`DELETE FROM workflow_steps WHERE workflow_id = $1`, [workflowId]);
      await pool.query(`DELETE FROM workflows WHERE id = $1`, [workflowId]);
    } catch (err) {
      console.error('Teardown query error:', err);
    } finally {
      await pool.end();
    }
  });

  test('triggerWorkflow succeeds for a valid trigger and creates a run', async () => {
    const payload = { hello: 'world' };
    const idempotencyKey = crypto.randomUUID();

    const result = await triggerWorkflow(pool, {
      triggerId,
      workflowId,
      payload,
      idempotencyKey,
      sourceType: 'webhook',
      userId: testUser,
    });

    assert.strictEqual(result.status, 'SUCCEEDED');
    assert.ok('runId' in result);
    assert.ok(result.runId);

    // Verify trigger execution record was updated to SUCCEEDED and linked to the run
    const execRes = await pool.query(
      `SELECT status, workflow_run_id, payload
       FROM workflow_trigger_executions
       WHERE trigger_id = $1 AND idempotency_key = $2`,
      [triggerId, idempotencyKey]
    );

    assert.strictEqual(execRes.rowCount, 1);
    const execRow = execRes.rows[0];
    assert.strictEqual(execRow.status, 'SUCCEEDED');
    assert.strictEqual(execRow.workflow_run_id, result.runId);
    assert.deepStrictEqual(execRow.payload, payload);
  });

  test('triggerWorkflow deduplicates subsequent calls with the same idempotency key', async () => {
    const payload = { event: 'duplicate-test' };
    const idempotencyKey = crypto.randomUUID();

    // First call should succeed
    const firstResult = await triggerWorkflow(pool, {
      triggerId,
      workflowId,
      payload,
      idempotencyKey,
      sourceType: 'event',
      userId: testUser,
    });
    assert.strictEqual(firstResult.status, 'SUCCEEDED');

    // Second call with the same idempotency key should be deduplicated
    const secondResult = await triggerWorkflow(pool, {
      triggerId,
      workflowId,
      payload,
      idempotencyKey,
      sourceType: 'event',
      userId: testUser,
    });
    assert.strictEqual(secondResult.status, 'DEDUPLICATED');

    // Verify only one execution row exists for this key
    const execCount = await pool.query(
      `SELECT COUNT(*)::int FROM workflow_trigger_executions
       WHERE trigger_id = $1 AND idempotency_key = $2`,
      [triggerId, idempotencyKey]
    );
    assert.strictEqual(execCount.rows[0].count, 1);
  });

  test('triggerWorkflow with null/undefined idempotency key (cron) always creates new runs', async () => {
    const payload = { tick: 12345 };

    // First call should succeed
    const firstResult = await triggerWorkflow(pool, {
      triggerId,
      workflowId,
      payload,
      idempotencyKey: undefined,
      sourceType: 'cron',
      userId: testUser,
    });
    assert.strictEqual(firstResult.status, 'SUCCEEDED');
    assert.ok('runId' in firstResult);

    // Second call should also succeed and create a new run
    const secondResult = await triggerWorkflow(pool, {
      triggerId,
      workflowId,
      payload,
      idempotencyKey: undefined,
      sourceType: 'cron',
      userId: testUser,
    });
    assert.strictEqual(secondResult.status, 'SUCCEEDED');
    assert.ok('runId' in secondResult);
    assert.notStrictEqual(firstResult.runId, secondResult.runId);

    // Verify two execution rows exist with NULL idempotency key
    const execCount = await pool.query(
      `SELECT COUNT(*)::int FROM workflow_trigger_executions
       WHERE trigger_id = $1 AND idempotency_key IS NULL`,
      [triggerId]
    );
    assert.strictEqual(execCount.rows[0].count, 2);
  });

  test('triggerWorkflow updates execution status to FAILED when createWorkflowRun fails', async () => {
    const invalidWorkflowId = crypto.randomUUID(); // Doesn't exist
    const payload = { bad: 'workflow' };
    const idempotencyKey = crypto.randomUUID();

    const result = await triggerWorkflow(pool, {
      triggerId,
      workflowId: invalidWorkflowId,
      payload,
      idempotencyKey,
      sourceType: 'webhook',
      userId: testUser,
    });

    assert.strictEqual(result.status, 'FAILED');
    assert.ok('error' in result);
    assert.ok(result.error);

    // Verify trigger execution record was updated to FAILED and has the error message
    const execRes = await pool.query(
      `SELECT status, workflow_run_id, error_message
       FROM workflow_trigger_executions
       WHERE trigger_id = $1 AND idempotency_key = $2`,
      [triggerId, idempotencyKey]
    );

    assert.strictEqual(execRes.rowCount, 1);
    const execRow = execRes.rows[0];
    assert.strictEqual(execRow.status, 'FAILED');
    assert.strictEqual(execRow.workflow_run_id, null);
    assert.ok(execRow.error_message);
  });
});
