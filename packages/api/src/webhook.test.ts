import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { FastifyInstance } from 'fastify';
import { pool } from '@flowforge/db';
import crypto from 'crypto';

describe('Webhook Token Receiver Integration Tests', () => {
  let app: FastifyInstance;
  const createdWorkflowIds: string[] = [];
  const createdTriggerIds: string[] = [];

  // Webhook tokens for test
  const tokenNoSecret = crypto.randomUUID();
  const tokenWithSecret = crypto.randomUUID();
  const tokenInactive = crypto.randomUUID();
  const webhookSecret = 'super-secret-validation-key';

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

    // Create a workflow to associate triggers with
    const workflowId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflows (id, name, created_by) VALUES ($1, $2, $3)`,
      [workflowId, 'Webhook Test Workflow', 'system:webhook']
    );
    createdWorkflowIds.push(workflowId);

    // Create a workflow step so that workflow run creation does not fail validation
    const stepId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
       VALUES ($1, $2, 'step-1', 'http-request', '{}', '{"maxAttempts":3,"baseDelayMs":1000}', 30)`,
      [stepId, workflowId]
    );

    // Create ACTIVE webhook trigger with NO secret
    const triggerNoSecretId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, created_by, updated_by)
       VALUES ($1, $2, 'No Secret Webhook', 'webhook', 'ACTIVE', $3, 'system:webhook', 'system:webhook')`,
      [triggerNoSecretId, workflowId, JSON.stringify({ webhook_token: tokenNoSecret })]
    );
    createdTriggerIds.push(triggerNoSecretId);

    // Create ACTIVE webhook trigger WITH secret
    const triggerWithSecretId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, created_by, updated_by)
       VALUES ($1, $2, 'With Secret Webhook', 'webhook', 'ACTIVE', $3, 'system:webhook', 'system:webhook')`,
      [triggerWithSecretId, workflowId, JSON.stringify({ webhook_token: tokenWithSecret, secret: webhookSecret })]
    );
    createdTriggerIds.push(triggerWithSecretId);

    // Create INACTIVE (PAUSED) webhook trigger
    const triggerInactiveId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, created_by, updated_by)
       VALUES ($1, $2, 'Inactive Webhook', 'webhook', 'PAUSED', $3, 'system:webhook', 'system:webhook')`,
      [triggerInactiveId, workflowId, JSON.stringify({ webhook_token: tokenInactive })]
    );
    createdTriggerIds.push(triggerInactiveId);
  });

  after(async () => {
    // Cleanup database rows in correct dependency order
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

    if (app) {
      await app.close();
    }
    await pool.end();
  });

  test('POST /api/webhooks/nonexistent-token returns 404 WEBHOOK_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/webhooks/nonexistent-token-12345`,
      payload: { test: true },
    });

    assert.strictEqual(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'WEBHOOK_NOT_FOUND');
  });

  test('POST /api/webhooks/:token (ACTIVE, no secret) returns 202 status ACCEPTED with run_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${tokenNoSecret}`,
      payload: { hello: 'world' },
    });

    assert.strictEqual(res.statusCode, 202);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.status, 'ACCEPTED');
    assert.ok(body.run_id);

    // Verify run was created in db
    const runRes = await pool.query(
      `SELECT input_payload FROM workflow_runs WHERE id = $1`,
      [body.run_id]
    );
    assert.strictEqual(runRes.rows.length, 1);
    assert.deepStrictEqual(runRes.rows[0].input_payload, { hello: 'world' });
  });

  test('POST /api/webhooks/:token with idempotency key (X-FlowForge-Delivery)', async () => {
    const deliveryId = `test-delivery-id-${crypto.randomUUID()}`;

    // First request should succeed with 202
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${tokenNoSecret}`,
      headers: {
        'x-flowforge-delivery': deliveryId,
      },
      payload: { idempotent: true },
    });

    assert.strictEqual(res1.statusCode, 202);
    const body1 = JSON.parse(res1.body);
    assert.strictEqual(body1.status, 'ACCEPTED');
    assert.ok(body1.run_id);

    // Second request with same delivery ID should return 200 DEDUPLICATED
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${tokenNoSecret}`,
      headers: {
        'x-flowforge-delivery': deliveryId,
      },
      payload: { idempotent: true },
    });

    assert.strictEqual(res2.statusCode, 200);
    const body2 = JSON.parse(res2.body);
    assert.strictEqual(body2.status, 'DEDUPLICATED');
    assert.strictEqual(body2.run_id, undefined);
  });

  test('POST /api/webhooks/:token with PAUSED webhook returns 409 WEBHOOK_INACTIVE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${tokenInactive}`,
      payload: { inactive: true },
    });

    assert.strictEqual(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'WEBHOOK_INACTIVE');
    assert.ok(body.message.includes('PAUSED'));
  });

  test('POST /api/webhooks/:token (with secret) signature validation behaviors', async () => {
    const payload = { secure: 'data' };
    const rawBodyBuffer = Buffer.from(JSON.stringify(payload));

    // Case 1: Missing signature header
    const resMissing = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${tokenWithSecret}`,
      payload,
    });
    assert.strictEqual(resMissing.statusCode, 401);
    assert.strictEqual(JSON.parse(resMissing.body).error, 'MISSING_SIGNATURE');

    // Case 2: Invalid signature
    const resInvalid = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${tokenWithSecret}`,
      headers: {
        'x-flowforge-signature': 'sha256=wrongsignaturevaluehere',
      },
      payload,
    });
    assert.strictEqual(resInvalid.statusCode, 401);
    assert.strictEqual(JSON.parse(resInvalid.body).error, 'INVALID_SIGNATURE');

    // Case 3: Valid signature
    const computedHmac = crypto.createHmac('sha256', webhookSecret).update(rawBodyBuffer).digest('hex');
    const validSignature = `sha256=${computedHmac}`;

    const resValid = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${tokenWithSecret}`,
      headers: {
        'x-flowforge-signature': validSignature,
      },
      payload,
    });
    assert.strictEqual(resValid.statusCode, 202);
    const validBody = JSON.parse(resValid.body);
    assert.strictEqual(validBody.status, 'ACCEPTED');
    assert.ok(validBody.run_id);
  });
});
