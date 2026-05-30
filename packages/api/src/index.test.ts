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

  // ─────────────────────────────────────────────────────────────────────────
  // Unit 13 — Run Trigger & Status API
  // ─────────────────────────────────────────────────────────────────────────

  // Track run IDs created during these tests for cleanup
  const createdRunIds: string[] = [];

  test('POST /api/workflows/:id/runs → 202 with WorkflowRunDto; root step QUEUED, non-root PENDING', async () => {
    // Use the first workflow created earlier (it was updated to 1 step by the PUT test, so re-create a 2-step one)
    const wfPayload = {
      name: 'Run Trigger Test Workflow',
      steps: [
        {
          stepKey: 'root-step',
          handlerName: 'http-request',
          inputConfig: { url: 'https://example.com' },
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: [],
        },
        {
          stepKey: 'child-step',
          handlerName: 'transform-json',
          inputConfig: {},
          retryPolicy: { maxAttempts: 2, baseDelayMs: 500 },
          timeoutSeconds: 10,
          dependsOn: ['root-step'],
        },
      ],
    };

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-user-123',
      },
      payload: wfPayload,
    });
    assert.strictEqual(createRes.statusCode, 201);
    const newWorkflow = JSON.parse(createRes.body).data;
    createdWorkflowIds.push(newWorkflow.id);

    // Trigger the run
    const triggerRes = await app.inject({
      method: 'POST',
      url: `/api/workflows/${newWorkflow.id}/runs`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
        'x-mock-user-id': 'operator-user-123',
      },
      payload: { inputPayload: { source: 'integration-test' } },
    });

    assert.strictEqual(triggerRes.statusCode, 202);
    const triggerBody = JSON.parse(triggerRes.body);
    assert.ok(triggerBody.data.id, 'response must contain a run id');
    assert.strictEqual(triggerBody.data.workflowId, newWorkflow.id);
    assert.strictEqual(triggerBody.data.status, 'RUNNING');

    // Root step QUEUED, child step PENDING
    const rootStep = triggerBody.data.steps.find((s: { stepKey: string }) => s.stepKey === 'root-step');
    const childStep = triggerBody.data.steps.find((s: { stepKey: string }) => s.stepKey === 'child-step');
    assert.ok(rootStep, 'root-step must be present');
    assert.ok(childStep, 'child-step must be present');
    assert.strictEqual(rootStep.status, 'QUEUED');
    assert.strictEqual(childStep.status, 'PENDING');

    createdRunIds.push(triggerBody.data.id);
  });

  test('POST /api/workflows/:id/runs with nonexistent workflow → 404 WORKFLOW_NOT_FOUND', async () => {
    const fakeId = crypto.randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${fakeId}/runs`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
      payload: {},
    });

    assert.strictEqual(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error.code, 'WORKFLOW_NOT_FOUND');
  });

  test('POST /api/workflows/:id/runs as viewer → 403 FORBIDDEN', async () => {
    const fakeId = crypto.randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${fakeId}/runs`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
      payload: {},
    });

    assert.strictEqual(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error.code, 'FORBIDDEN');
  });

  test('POST /api/workflows/:id/runs with non-object inputPayload → 422 VALIDATION_ERROR', async () => {
    const fakeId = crypto.randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${fakeId}/runs`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
      payload: { inputPayload: 'not-an-object' },
    });

    assert.strictEqual(res.statusCode, 422);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
  });

  test('GET /api/runs/:id returns full run detail with workflowName, steps, stepKey, handlerName', async () => {
    assert.ok(createdRunIds[0], 'A run must have been created in the trigger test');
    const res = await app.inject({
      method: 'GET',
      url: `/api/runs/${createdRunIds[0]}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const run = body.data;
    assert.ok(run.workflowName, 'workflowName must be present');
    assert.ok(Array.isArray(run.steps), 'steps must be an array');
    assert.strictEqual(run.steps.length, 2);

    const rootStep = run.steps.find((s: { stepKey: string }) => s.stepKey === 'root-step');
    assert.ok(rootStep, 'root-step must be present');
    assert.strictEqual(rootStep.handlerName, 'http-request');
    assert.strictEqual(rootStep.stepKey, 'root-step');
  });

  test('GET /api/runs/:id with nonexistent id → 404 RUN_NOT_FOUND', async () => {
    const fakeId = crypto.randomUUID();
    const res = await app.inject({
      method: 'GET',
      url: `/api/runs/${fakeId}`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });

    assert.strictEqual(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error.code, 'RUN_NOT_FOUND');
  });

  test('GET /api/runs returns a paginated list with correct shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/runs?page=1&limit=10',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.data.items), 'items must be an array');
    assert.ok(typeof body.data.total === 'number', 'total must be a number');
    assert.strictEqual(body.data.page, 1);
    assert.strictEqual(body.data.limit, 10);
    assert.ok(body.data.total >= 1, 'At least one run must exist');
  });

  test('GET /api/runs?status=RUNNING returns only RUNNING runs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/runs?status=RUNNING',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    for (const item of body.data.items as Array<{ status: string }>) {
      assert.strictEqual(item.status, 'RUNNING');
    }
  });

  test('GET /api/workflows/:id/runs returns runs scoped to workflow', async () => {
    const workflowId = createdWorkflowIds[createdWorkflowIds.length - 1];
    assert.ok(workflowId, 'A workflow must exist for scoped listing');

    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/${workflowId}/runs`,
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.data.items));
    assert.ok(body.data.total >= 1);

    // All items must belong to the specified workflow
    for (const item of body.data.items as Array<{ workflowId: string }>) {
      assert.strictEqual(item.workflowId, workflowId);
    }
  });

  test('POST /api/workflows/:id/runs inserts an audit log row with workflowId and inputPayloadSize', async () => {
    const runId = createdRunIds[0];
    assert.ok(runId, 'A run must have been created in the trigger test');

    const auditRes = await pool.query(
      `SELECT actor_id, action, resource_id, metadata
       FROM audit_logs
       WHERE resource_id = $1 AND action = 'run.trigger'
       LIMIT 1`,
      [runId]
    );

    assert.strictEqual(auditRes.rows.length, 1, 'Audit log row must exist');
    const auditRow = auditRes.rows[0];
    assert.strictEqual(auditRow.action, 'run.trigger');
    assert.strictEqual(auditRow.actor_id, 'operator-user-123');
    assert.ok(auditRow.metadata.workflowId, 'metadata must contain workflowId');
    assert.ok(typeof auditRow.metadata.inputPayloadSize === 'number', 'metadata must contain inputPayloadSize as number');
  });
});

