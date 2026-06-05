import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { FastifyInstance } from 'fastify';
import { pool } from '@flowforge/db';
import crypto from 'crypto';

describe('Workflow Trigger CRUD and State Machine Integration Tests', () => {
  let app: FastifyInstance;
  const createdWorkflowIds: string[] = [];
  const createdTriggerIds: string[] = [];

  before(async () => {
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
      [workflowId, 'Trigger Test Workflow', 'system:trigger-test']
    );
    createdWorkflowIds.push(workflowId);
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
        `DELETE FROM workflows WHERE id = ANY($1)`,
        [createdWorkflowIds]
      );
    }

    // Clean up audit logs created during test
    await pool.query(
      `DELETE FROM audit_logs WHERE action LIKE 'trigger.%'`
    );

    if (app) {
      await app.close();
    }
  });

  test('POST /api/workflows/:id/triggers (cron) with invalid cron expression returns 422 INVALID_CRON', async () => {
    const workflowId = createdWorkflowIds[0];
    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflowId}/triggers`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
      payload: {
        type: 'cron',
        name: 'Invalid Cron Trigger',
        config: {
          cron: 'invalid-expression-here',
          misfire_policy: 'SKIP',
        },
      },
    });

    assert.strictEqual(res.statusCode, 422);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'INVALID_CRON');
    assert.strictEqual(body.field, 'config.cron');
  });

  test('POST /api/workflows/:id/triggers (cron) with invalid body structure returns 422 VALIDATION_ERROR', async () => {
    const workflowId = createdWorkflowIds[0];
    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflowId}/triggers`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
      payload: {
        type: 'cron',
        name: 'Missing Config Trigger',
      },
    });

    assert.strictEqual(res.statusCode, 422);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
  });

  test('POST /api/workflows/:id/triggers (cron) with valid expression creates trigger (201)', async () => {
    const workflowId = createdWorkflowIds[0];
    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflowId}/triggers`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
      payload: {
        type: 'cron',
        name: 'Daily Cron Trigger',
        config: {
          cron: '0 9 * * *',
          misfire_policy: 'SKIP',
        },
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.id);
    createdTriggerIds.push(body.id);

    // Verify it exists in db with initial ACTIVE status and computed next_fire_at
    const dbRes = await pool.query(
      `SELECT name, type, status, config, next_fire_at FROM workflow_triggers WHERE id = $1`,
      [body.id]
    );
    assert.strictEqual(dbRes.rows.length, 1);
    assert.strictEqual(dbRes.rows[0].name, 'Daily Cron Trigger');
    assert.strictEqual(dbRes.rows[0].type, 'cron');
    assert.strictEqual(dbRes.rows[0].status, 'ACTIVE');
    assert.ok(dbRes.rows[0].next_fire_at);

    // Verify audit log creation
    const auditRes = await pool.query(
      `SELECT action, actor_id, metadata FROM audit_logs WHERE resource_id = $1 AND action = 'trigger.create'`,
      [body.id]
    );
    assert.strictEqual(auditRes.rows.length, 1);
    assert.strictEqual(auditRes.rows[0].actor_id, 'operator-123');
    assert.strictEqual(auditRes.rows[0].metadata.name, 'Daily Cron Trigger');
    assert.strictEqual(auditRes.rows[0].metadata.type, 'cron');
  });

  test('POST /api/workflows/:id/triggers (webhook) creates trigger with generated token', async () => {
    const workflowId = createdWorkflowIds[0];
    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflowId}/triggers`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
      payload: {
        type: 'webhook',
        name: 'Secure Webhook Trigger',
        config: {
          secret: 'my-signature-secret',
        },
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.id);
    createdTriggerIds.push(body.id);

    // Verify it exists in db with generated webhook_token
    const dbRes = await pool.query(
      `SELECT config FROM workflow_triggers WHERE id = $1`,
      [body.id]
    );
    assert.ok(dbRes.rows[0].config.webhook_token);
    assert.strictEqual(dbRes.rows[0].config.secret, 'my-signature-secret');
  });

  test('POST /api/workflows/:id/triggers (event) creates trigger', async () => {
    const workflowId = createdWorkflowIds[0];
    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflowId}/triggers`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
      payload: {
        type: 'event',
        name: 'Order Created Event Trigger',
        config: {
          event_type: 'order.created',
        },
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.id);
    createdTriggerIds.push(body.id);

    const dbRes = await pool.query(
      `SELECT config FROM workflow_triggers WHERE id = $1`,
      [body.id]
    );
    assert.strictEqual(dbRes.rows[0].config.event_type, 'order.created');
  });

  test('GET /api/workflows/:id/triggers lists all triggers', async () => {
    const workflowId = createdWorkflowIds[0];
    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/${workflowId}/triggers`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
        'x-mock-user-id': 'viewer-123',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.triggers));
    // We created 3 triggers for this workflow
    assert.strictEqual(body.triggers.length, 3);
  });

  test('GET /api/triggers/:id returns trigger with empty executions history', async () => {
    const triggerId = createdTriggerIds[0]; // Daily Cron Trigger
    const res = await app.inject({
      method: 'GET',
      url: `/api/triggers/${triggerId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
        'x-mock-user-id': 'viewer-123',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.trigger.id, triggerId);
    assert.strictEqual(body.trigger.name, 'Daily Cron Trigger');
    assert.ok(Array.isArray(body.recentExecutions));
    assert.strictEqual(body.recentExecutions.length, 0);
  });

  test('GET /api/triggers/:id with non-existent trigger ID returns 404 TRIGGER_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/triggers/${crypto.randomUUID()}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
        'x-mock-user-id': 'viewer-123',
      },
    });

    assert.strictEqual(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'TRIGGER_NOT_FOUND');
  });

  test('PUT /api/triggers/:id updates name and merges config correctly, recalculating next_fire_at', async () => {
    const triggerId = createdTriggerIds[0]; // Daily Cron Trigger
    const initialDbRes = await pool.query(
      `SELECT next_fire_at FROM workflow_triggers WHERE id = $1`,
      [triggerId]
    );
    const initialNextFire = new Date(initialDbRes.rows[0].next_fire_at);

    // Update to run every Friday at 12:00
    const res = await app.inject({
      method: 'PUT',
      url: `/api/triggers/${triggerId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
      payload: {
        name: 'Weekly Cron Trigger',
        config: {
          cron: '0 12 * * 5',
        },
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.updated, true);

    const dbRes = await pool.query(
      `SELECT name, config, next_fire_at FROM workflow_triggers WHERE id = $1`,
      [triggerId]
    );
    assert.strictEqual(dbRes.rows[0].name, 'Weekly Cron Trigger');
    assert.strictEqual(dbRes.rows[0].config.cron, '0 12 * * 5');
    assert.strictEqual(dbRes.rows[0].config.misfire_policy, 'SKIP'); // preserved from merge!
    const updatedNextFire = new Date(dbRes.rows[0].next_fire_at);
    assert.notStrictEqual(initialNextFire.getTime(), updatedNextFire.getTime());

    // Verify audit log creation
    const auditRes = await pool.query(
      `SELECT action, actor_id, metadata FROM audit_logs WHERE resource_id = $1 AND action = 'trigger.update'`,
      [triggerId]
    );
    assert.strictEqual(auditRes.rows.length, 1);
    assert.strictEqual(auditRes.rows[0].actor_id, 'operator-123');
  });

  test('PUT /api/triggers/:id with invalid merged config (invalid cron) returns 422', async () => {
    const triggerId = createdTriggerIds[0];
    const res = await app.inject({
      method: 'PUT',
      url: `/api/triggers/${triggerId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
      payload: {
        config: {
          cron: 'invalid-cron-again',
        },
      },
    });

    assert.strictEqual(res.statusCode, 422);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'INVALID_CRON');
  });

  test('PUT /api/triggers/:id (webhook) preserves webhook_token and allows secret update', async () => {
    const triggerId = createdTriggerIds[1]; // Webhook trigger
    const initialRes = await pool.query(
      `SELECT config FROM workflow_triggers WHERE id = $1`,
      [triggerId]
    );
    const token = initialRes.rows[0].config.webhook_token;

    const res = await app.inject({
      method: 'PUT',
      url: `/api/triggers/${triggerId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
      payload: {
        config: {
          secret: 'brand-new-secret',
          webhook_token: 'should-be-ignored-malicious-token',
        },
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const dbRes = await pool.query(
      `SELECT config FROM workflow_triggers WHERE id = $1`,
      [triggerId]
    );
    assert.strictEqual(dbRes.rows[0].config.secret, 'brand-new-secret');
    assert.strictEqual(dbRes.rows[0].config.webhook_token, token); // token preserved!
  });

  test('State Machine: Pause, Resume, Disable, and Delete behaviors', async () => {
    const triggerId = createdTriggerIds[2]; // Event trigger

    // 1. Pause the trigger (ACTIVE -> PAUSED)
    const pauseRes = await app.inject({
      method: 'POST',
      url: `/api/triggers/${triggerId}/pause`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
    });
    assert.strictEqual(pauseRes.statusCode, 200);
    assert.strictEqual(JSON.parse(pauseRes.body).status, 'PAUSED');

    // Verify database and audit log
    let dbStatus = await pool.query(`SELECT status FROM workflow_triggers WHERE id = $1`, [triggerId]);
    assert.strictEqual(dbStatus.rows[0].status, 'PAUSED');
    let auditRes = await pool.query(`SELECT 1 FROM audit_logs WHERE resource_id = $1 AND action = 'trigger.pause'`, [triggerId]);
    assert.strictEqual(auditRes.rows.length, 1);

    // 2. Pause again -> expect 409 NOT_ACTIVE
    const pauseAgain = await app.inject({
      method: 'POST',
      url: `/api/triggers/${triggerId}/pause`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
    });
    assert.strictEqual(pauseAgain.statusCode, 409);
    assert.strictEqual(JSON.parse(pauseAgain.body).error, 'NOT_ACTIVE');

    // 3. Attempt Delete while PAUSED -> expect 409 CANNOT_DELETE
    const deletePaused = await app.inject({
      method: 'DELETE',
      url: `/api/triggers/${triggerId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
    });
    assert.strictEqual(deletePaused.statusCode, 409);
    assert.strictEqual(JSON.parse(deletePaused.body).error, 'CANNOT_DELETE');

    // 4. Resume the trigger (PAUSED -> ACTIVE)
    const resumeRes = await app.inject({
      method: 'POST',
      url: `/api/triggers/${triggerId}/resume`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
    });
    assert.strictEqual(resumeRes.statusCode, 200);
    assert.strictEqual(JSON.parse(resumeRes.body).status, 'ACTIVE');

    // Verify database and audit log
    dbStatus = await pool.query(`SELECT status FROM workflow_triggers WHERE id = $1`, [triggerId]);
    assert.strictEqual(dbStatus.rows[0].status, 'ACTIVE');
    auditRes = await pool.query(`SELECT 1 FROM audit_logs WHERE resource_id = $1 AND action = 'trigger.resume'`, [triggerId]);
    assert.strictEqual(auditRes.rows.length, 1);

    // 5. Resume again -> expect 409 NOT_PAUSED
    const resumeAgain = await app.inject({
      method: 'POST',
      url: `/api/triggers/${triggerId}/resume`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
    });
    assert.strictEqual(resumeAgain.statusCode, 409);
    assert.strictEqual(JSON.parse(resumeAgain.body).error, 'NOT_PAUSED');

    // 6. Disable the trigger (ACTIVE -> DISABLED)
    const disableRes = await app.inject({
      method: 'POST',
      url: `/api/triggers/${triggerId}/disable`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
    });
    assert.strictEqual(disableRes.statusCode, 200);
    assert.strictEqual(JSON.parse(disableRes.body).status, 'DISABLED');

    // Verify database and audit log
    dbStatus = await pool.query(`SELECT status FROM workflow_triggers WHERE id = $1`, [triggerId]);
    assert.strictEqual(dbStatus.rows[0].status, 'DISABLED');
    auditRes = await pool.query(`SELECT 1 FROM audit_logs WHERE resource_id = $1 AND action = 'trigger.disable'`, [triggerId]);
    assert.strictEqual(auditRes.rows.length, 1);

    // 7. Disable again -> expect 409 ALREADY_DISABLED
    const disableAgain = await app.inject({
      method: 'POST',
      url: `/api/triggers/${triggerId}/disable`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
    });
    assert.strictEqual(disableAgain.statusCode, 409);
    assert.strictEqual(JSON.parse(disableAgain.body).error, 'ALREADY_DISABLED');

    // 8. Attempt PUT on DISABLED trigger -> expect 404 NOT_FOUND_OR_DISABLED
    const putDisabled = await app.inject({
      method: 'PUT',
      url: `/api/triggers/${triggerId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
      payload: { name: 'New Name for Disabled' },
    });
    assert.strictEqual(putDisabled.statusCode, 404);

    // 9. Delete trigger while DISABLED -> expect 204
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/triggers/${triggerId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-123',
      },
    });
    assert.strictEqual(deleteRes.statusCode, 204);

    // Verify it is gone from db and audit log is logged
    const dbDeleted = await pool.query(`SELECT 1 FROM workflow_triggers WHERE id = $1`, [triggerId]);
    assert.strictEqual(dbDeleted.rows.length, 0);
    auditRes = await pool.query(`SELECT 1 FROM audit_logs WHERE resource_id = $1 AND action = 'trigger.delete'`, [triggerId]);
    assert.strictEqual(auditRes.rows.length, 1);

    // Remove from our clean up array so we don't try to delete again
    const idx = createdTriggerIds.indexOf(triggerId);
    if (idx !== -1) {
      createdTriggerIds.splice(idx, 1);
    }
  });

  test('Viewer role permissions (GET allowed, mutations return 403 Forbidden)', async () => {
    const workflowId = createdWorkflowIds[0];
    const triggerId = createdTriggerIds[0];

    // Viewer trying to POST (create) -> 403
    const postRes = await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflowId}/triggers`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
      payload: {
        type: 'event',
        name: 'Viewer Fail Trigger',
        config: { event_type: 'some.event' },
      },
    });
    assert.strictEqual(postRes.statusCode, 403);
    assert.strictEqual(JSON.parse(postRes.body).error.code, 'FORBIDDEN');

    // Viewer trying to PUT (update) -> 403
    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/triggers/${triggerId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
      payload: { name: 'Viewer Renamed' },
    });
    assert.strictEqual(putRes.statusCode, 403);

    // Viewer trying to POST pause -> 403
    const pauseRes = await app.inject({
      method: 'POST',
      url: `/api/triggers/${triggerId}/pause`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });
    assert.strictEqual(pauseRes.statusCode, 403);

    // Viewer trying to DELETE -> 403
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/triggers/${triggerId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });
    assert.strictEqual(deleteRes.statusCode, 403);
  });
});
