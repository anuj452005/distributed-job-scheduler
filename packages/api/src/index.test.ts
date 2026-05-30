import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { FastifyInstance } from 'fastify';
import { pool } from '@flowforge/db';
import crypto from 'crypto';

describe('Fastify API Foundation and Authentication Tests', () => {
  let app: FastifyInstance;
  const createdWorkflowIds: string[] = [];

  before(async () => {
    // Preserve the original DATABASE_URL from .env so we connect to the real test database,
    // otherwise fallback to the standard mock URL if not set.
    process.env.NODE_ENV = 'test';
    process.env.CLERK_SECRET_KEY = 'sk_test_mock_secret_key';
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_mock_publishable_key';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@localhost:5432/mock?sslmode=disable';
    process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

    // Dynamically import buildServer to ensure env vars are populated in config.ts
    const { buildServer } = await import('./server.js');
    app = await buildServer();
  });

  after(async () => {
    // Clean up all workflows created during the test runs
    if (createdWorkflowIds.length > 0) {
      await pool.query(
        `DELETE FROM workflow_runs WHERE workflow_id = ANY($1)`,
        [createdWorkflowIds]
      );
      await pool.query(
        `DELETE FROM workflows WHERE id = ANY($1)`,
        [createdWorkflowIds]
      );
      await pool.query(
        `DELETE FROM audit_logs WHERE resource_id = ANY($1)`,
        [createdWorkflowIds]
      );
    }

    if (app) {
      await app.close();
    }
    await pool.end();
  });

  test('GET /health returns 200 and status ok without authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepStrictEqual(body, { status: 'ok' });
  });

  test('GET /api/workflows without Authorization header returns 401 Unauthorized', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows',
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
    assert.strictEqual(body.error.message, 'Authentication required');
  });

  test('GET /api/workflows with invalid token returns 401 Unauthorized', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer invalid',
      },
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
  });

  test('POST /api/workflows with valid Clerk JWT (viewer role) returns 403 Forbidden', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
      payload: {
        name: 'Viewer Test Workflow',
        steps: []
      },
    });

    assert.strictEqual(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error.code, 'FORBIDDEN');
    assert.strictEqual(body.error.message, 'Insufficient permissions');
  });

  test('POST /api/workflows with valid 3-step linear DAG creates workflow', async () => {
    const payload = {
      name: 'Integration Test Workflow',
      description: 'A beautiful test workflow',
      steps: [
        {
          stepKey: 'step-a',
          handlerName: 'http-request',
          inputConfig: { url: 'https://example.com' },
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: []
        },
        {
          stepKey: 'step-b',
          handlerName: 'transform-json',
          inputConfig: { format: 'json' },
          retryPolicy: { maxAttempts: 2, baseDelayMs: 2000 },
          timeoutSeconds: 60,
          dependsOn: ['step-a']
        },
        {
          stepKey: 'step-c',
          handlerName: 'send-email',
          inputConfig: { to: 'test@example.com' },
          retryPolicy: { maxAttempts: 5, baseDelayMs: 500 },
          timeoutSeconds: 15,
          dependsOn: ['step-b']
        }
      ]
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-user-123'
      },
      payload,
    });

    assert.strictEqual(response.statusCode, 201);
    const body = JSON.parse(response.body);
    assert.ok(body.data.id);
    assert.strictEqual(body.data.name, 'Integration Test Workflow');
    assert.strictEqual(body.data.stepCount, 3);
    assert.strictEqual(body.data.version, 1);

    createdWorkflowIds.push(body.data.id);

    // Verify it exists in the database
    const dbRes = await pool.query(`SELECT name FROM workflows WHERE id = $1`, [body.data.id]);
    assert.strictEqual(dbRes.rows[0].name, 'Integration Test Workflow');

    // Verify audit log
    const auditRes = await pool.query(
      `SELECT action, actor_id, metadata FROM audit_logs WHERE resource_id = $1`,
      [body.data.id]
    );
    assert.strictEqual(auditRes.rows[0].action, 'workflow.create');
    assert.strictEqual(auditRes.rows[0].actor_id, 'operator-user-123');
    assert.deepStrictEqual(auditRes.rows[0].metadata, { name: 'Integration Test Workflow' });
  });

  test('POST /api/workflows with dependency cycle (A -> B -> A) returns 422', async () => {
    const payload = {
      name: 'Cyclic Test Workflow',
      steps: [
        {
          stepKey: 'step-a',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: ['step-b']
        },
        {
          stepKey: 'step-b',
          handlerName: 'transform-json',
          inputConfig: {},
          retryPolicy: { maxAttempts: 2, baseDelayMs: 2000 },
          timeoutSeconds: 60,
          dependsOn: ['step-a']
        }
      ]
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
      payload,
    });

    assert.strictEqual(response.statusCode, 422);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    assert.strictEqual(body.error.message, 'Workflow definition is invalid');
    assert.ok(body.error.details.some((d: any) => d.field === 'steps' && d.message.toLowerCase().includes('cycle')));
  });

  test('POST /api/workflows with unregistered handlerName returns 422', async () => {
    const payload = {
      name: 'Invalid Handler Workflow',
      steps: [
        {
          stepKey: 'step-a',
          handlerName: 'nonexistent-handler-999',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: []
        }
      ]
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
      payload,
    });

    assert.strictEqual(response.statusCode, 422);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.some((d: any) => d.field === 'steps[0].handlerName' && d.message.includes('nonexistent-handler-999')));
  });

  test('GET /api/workflows returns paginated list of workflows', async () => {
    // Ensure we have at least one workflow from previous test
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows?page=1&limit=5',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(body.data.items);
    assert.ok(body.data.total >= 1);
    assert.strictEqual(body.data.page, 1);
    assert.strictEqual(body.data.limit, 5);

    const match = body.data.items.find((item: any) => item.id === createdWorkflowIds[0]);
    assert.ok(match);
    assert.strictEqual(match.stepCount, 3);
  });

  test('GET /api/workflows/:id returns full workflow detail with steps and dependsOn', async () => {
    const id = createdWorkflowIds[0];
    const response = await app.inject({
      method: 'GET',
      url: `/api/workflows/${id}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.data.id, id);
    assert.strictEqual(body.data.steps.length, 3);

    const stepB = body.data.steps.find((s: any) => s.stepKey === 'step-b');
    assert.ok(stepB);
    assert.deepStrictEqual(stepB.dependsOn, ['step-a']);
  });

  test('GET /api/workflows/:id with nonexistent ID returns 404', async () => {
    const nonexistentId = crypto.randomUUID();
    const response = await app.inject({
      method: 'GET',
      url: `/api/workflows/${nonexistentId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });

    assert.strictEqual(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error.code, 'NOT_FOUND');
  });

  test('PUT /api/workflows/:id updates and increments version', async () => {
    const id = createdWorkflowIds[0];
    const payload = {
      name: 'Updated Test Workflow',
      description: 'An updated workflow description',
      steps: [
        {
          stepKey: 'step-a-new',
          handlerName: 'http-request',
          inputConfig: { url: 'https://new.com' },
          retryPolicy: { maxAttempts: 1, baseDelayMs: 100 },
          timeoutSeconds: 10,
          dependsOn: []
        }
      ]
    };

    const response = await app.inject({
      method: 'PUT',
      url: `/api/workflows/${id}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-user-123'
      },
      payload,
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.data.id, id);
    assert.strictEqual(body.data.name, 'Updated Test Workflow');
    assert.strictEqual(body.data.version, 2);
    assert.strictEqual(body.data.stepCount, 1);

    // Verify audit log
    const auditRes = await pool.query(
      `SELECT action, actor_id, metadata FROM audit_logs WHERE resource_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    assert.strictEqual(auditRes.rows[0].action, 'workflow.update');
    assert.deepStrictEqual(auditRes.rows[0].metadata, { name: 'Updated Test Workflow' });
  });

  test('DELETE /api/workflows/:id checks active RUNNING runs and deletes correctly', async () => {
    // 1. Create a temporary workflow
    const payload = {
      name: 'Deletion test workflow',
      steps: [
        {
          stepKey: 'step-1',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 1, baseDelayMs: 100 },
          timeoutSeconds: 10,
          dependsOn: []
        }
      ]
    };

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
      payload,
    });
    const tempWorkflow = JSON.parse(createRes.body).data;
    createdWorkflowIds.push(tempWorkflow.id);

    // 2. Seed an active RUNNING workflow run
    const runId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_runs (id, workflow_id, status, triggered_by)
       VALUES ($1, $2, 'RUNNING', 'test-operator')`,
      [runId, tempWorkflow.id]
    );

    // 3. Attempt delete -> expect 409 Conflict
    const deleteConfRes = await app.inject({
      method: 'DELETE',
      url: `/api/workflows/${tempWorkflow.id}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
    });
    assert.strictEqual(deleteConfRes.statusCode, 409);
    const confBody = JSON.parse(deleteConfRes.body);
    assert.strictEqual(confBody.error.code, 'CONFLICT');

    // 4. Update run status to COMPLETED
    await pool.query(
      `UPDATE workflow_runs SET status = 'COMPLETED' WHERE id = $1`,
      [runId]
    );

    // 5. Attempt delete again -> expect 204 Success
    const deleteSuccessRes = await app.inject({
      method: 'DELETE',
      url: `/api/workflows/${tempWorkflow.id}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-user-123'
      },
    });
    assert.strictEqual(deleteSuccessRes.statusCode, 204);

    // Verify audit log
    const auditRes = await pool.query(
      `SELECT action, actor_id FROM audit_logs WHERE resource_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tempWorkflow.id]
    );
    assert.strictEqual(auditRes.rows[0].action, 'workflow.delete');
    assert.strictEqual(auditRes.rows[0].actor_id, 'operator-user-123');

    // Verify workflow is deleted
    const checkRes = await pool.query(`SELECT 1 FROM workflows WHERE id = $1`, [tempWorkflow.id]);
    assert.strictEqual(checkRes.rows.length, 0);
  });

  test('Global error handler formats thrown errors and redacts internal traces', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test-error',
    });

    assert.strictEqual(response.statusCode, 500);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error.code, 'INTERNAL_SERVER_ERROR');
    assert.strictEqual(body.error.message, 'An unexpected error occurred');
    assert.strictEqual(body.error.details, undefined);
  });
});
