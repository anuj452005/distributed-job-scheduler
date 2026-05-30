import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { FastifyInstance } from 'fastify';

describe('Fastify API Foundation and Authentication Tests', () => {
  let app: FastifyInstance;

  before(async () => {
    // Set up mock environment variables before importing server modules dynamically
    process.env.NODE_ENV = 'test';
    process.env.CLERK_SECRET_KEY = 'sk_test_mock_secret_key';
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_mock_publishable_key';
    process.env.DATABASE_URL = 'postgresql://neondb_owner:password@localhost:5432/mock?sslmode=disable';
    process.env.REDIS_URL = 'redis://localhost:6379';

    // Dynamically import buildServer to ensure env vars are populated in config.ts
    const { buildServer } = await import('./server.js');
    app = await buildServer();
  });

  after(async () => {
    if (app) {
      await app.close();
    }
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

  test('GET /api/workflows with valid Clerk JWT (operator) returns 200 and data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepStrictEqual(body, { data: [] });
  });

  test('GET /api/workflows with valid Clerk JWT (viewer) returns 200 and data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepStrictEqual(body, { data: [] });
  });

  test('POST /api/workflows with valid Clerk JWT (viewer role) returns 403 Forbidden', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'viewer',
      },
      payload: {},
    });

    assert.strictEqual(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error.code, 'FORBIDDEN');
    assert.strictEqual(body.error.message, 'Insufficient permissions');
  });

  test('POST /api/workflows with valid Clerk JWT (operator role) returns 200 Success', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: {
        authorization: 'Bearer valid-test-token',
        'x-mock-role': 'operator',
      },
      payload: {},
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepStrictEqual(body, { data: { success: true } });
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
