import { test, describe } from 'node:test';
import assert from 'node:assert';
import { handlerRegistry, registerAllHandlers } from './index.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });
const mockCtx = (signal?: AbortSignal) => ({
  workflowRunId: 'test-wf',
  stepRunId: 'test-step',
  attempt: 1,
  idempotencyKey: 'test-key',
  signal: signal || new AbortController().signal,
  logger,
});

describe('Handler Registry', () => {
  test('should register all 7 handlers', () => {
    registerAllHandlers();
    const all = handlerRegistry.getAll();
    assert.deepStrictEqual(all.sort(), [
      'blob-to-postgres',
      'embedding-generator',
      'http-request',
      'repo-indexer',
      'send-email',
      'sql-query',
      'transform-json'
    ]);
  });

  test('should throw on registering existing', () => {
    assert.throws(() => {
      handlerRegistry.register('http-request', async () => ({}));
    }, /already registered/);
  });

  test('should check existence', () => {
    assert.strictEqual(handlerRegistry.has('http-request'), true);
    assert.strictEqual(handlerRegistry.has('nonexistent'), false);
  });

  test('should throw on getting nonexistent', () => {
    assert.throws(() => {
      handlerRegistry.get('nonexistent');
    }, /not registered/);
  });
});

describe('Handlers Validation & Behavior', () => {
  test('http-request should succeed with GET', async () => {
    const handler = handlerRegistry.get('http-request');
    const res = await handler(mockCtx(), {
      method: 'GET',
      url: 'https://httpbin.org/get',
    }) as any;

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers);
    assert.ok(res.body);
  });

  test('http-request should reject invalid method or url', async () => {
    const handler = handlerRegistry.get('http-request');
    await assert.rejects(async () => {
      await handler(mockCtx(), {
        method: 'INVALID',
        url: 'https://httpbin.org/get',
      });
    }, (err: any) => err.name === 'ZodError');

    await assert.rejects(async () => {
      await handler(mockCtx(), {
        method: 'GET',
        url: 'not-a-url',
      });
    }, (err: any) => err.name === 'ZodError');
  });

  test('http-request should abort on timeout', async () => {
    const handler = handlerRegistry.get('http-request');
    await assert.rejects(async () => {
      await handler(mockCtx(), {
        method: 'GET',
        url: 'https://httpbin.org/delay/3',
        timeoutMs: 500,
      });
    }, /timed out/);
  });

  test('http-request should support manual abort', async () => {
    const handler = handlerRegistry.get('http-request');
    const controller = new AbortController();
    const ctx = mockCtx(controller.signal);
    
    setTimeout(() => controller.abort(), 50);

    await assert.rejects(async () => {
      await handler(ctx, {
        method: 'GET',
        url: 'https://httpbin.org/delay/3',
      });
    }, (err: any) => err.name === 'AbortError' || err.message.includes('aborted') || err.message.includes('cancelled'));
  });

  test('send-email MVP stub', async () => {
    const handler = handlerRegistry.get('send-email');
    const res = await handler(mockCtx(), {
      connectionRef: 'my-smtp',
      to: ['test@example.com'],
      subject: 'Test Subject',
      body: 'Hello World',
    }) as any;

    assert.deepStrictEqual(res, {
      sent: true,
      to: ['test@example.com'],
      subject: 'Test Subject',
    });
  });

  test('send-email should reject invalid input', async () => {
    const handler = handlerRegistry.get('send-email');
    await assert.rejects(async () => {
      await handler(mockCtx(), {
        connectionRef: 'my-smtp',
        to: [],
        subject: 'Test',
        body: 'Hello',
      });
    }, (err: any) => err.name === 'ZodError');
  });

  test('sql-query MVP stub', async () => {
    const handler = handlerRegistry.get('sql-query');
    const res = await handler(mockCtx(), {
      connectionRef: 'my-db',
      query: 'SELECT * FROM users',
    }) as any;

    assert.deepStrictEqual(res, {
      rows: [],
      rowCount: 0,
    });
  });

  test('blob-to-postgres MVP stub', async () => {
    const handler = handlerRegistry.get('blob-to-postgres');
    const res = await handler(mockCtx(), {
      sourceConnectionRef: 's3',
      targetConnectionRef: 'pg',
      blobPath: 'data.csv',
      targetTable: 'users',
      columnMapping: { name: 'full_name' },
    }) as any;

    assert.deepStrictEqual(res, {
      rowsProcessed: 0,
    });
  });

  test('transform-json should correctly evaluate expression', async () => {
    const handler = handlerRegistry.get('transform-json');
    const res = await handler(mockCtx(), {
      expression: '$.name',
      input: { name: 'test' },
    });

    assert.strictEqual(res, 'test');
  });

  test('repo-indexer MVP stub', async () => {
    const handler = handlerRegistry.get('repo-indexer');
    const res = await handler(mockCtx(), {
      repoUrl: 'https://github.com/test/repo',
    }) as any;

    assert.deepStrictEqual(res, {
      filesIndexed: 0,
    });
  });

  test('embedding-generator MVP stub', async () => {
    const handler = handlerRegistry.get('embedding-generator');
    const res = await handler(mockCtx(), {
      connectionRef: 'openai',
      text: 'hello',
    }) as any;

    assert.deepStrictEqual(res, {
      embedding: [],
      dimensions: 0,
    });
  });
});
