import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { pool } from '@flowforge/db';
import crypto from 'crypto';
import {
  validateWorkflowDag,
  topologicalSort,
  createWorkflowRun,
  createReplayRun,
  cancelWorkflowRun
} from './index.js';

describe('Engine Package Tests', () => {
  // Mock handler registry
  const mockRegistry = {
    has(name: string): boolean {
      return ['http-request', 'transform-json', 'registered-handler'].includes(name);
    }
  };

  describe('DAG Validation Tests', () => {
    test('linear A -> B -> C is valid', () => {
      const steps = [
        {
          stepKey: 'stepA',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: []
        },
        {
          stepKey: 'stepB',
          handlerName: 'transform-json',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: ['stepA']
        },
        {
          stepKey: 'stepC',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: ['stepB']
        }
      ];

      const res = validateWorkflowDag(steps, mockRegistry);
      assert.deepStrictEqual(res, { valid: true });

      const sorted = topologicalSort(steps);
      assert.deepStrictEqual(sorted, ['stepA', 'stepB', 'stepC']);
    });

    test('diamond DAG is valid', () => {
      const steps = [
        {
          stepKey: 'stepA',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: []
        },
        {
          stepKey: 'stepB',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: ['stepA']
        },
        {
          stepKey: 'stepC',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: ['stepA']
        },
        {
          stepKey: 'stepD',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: ['stepB', 'stepC']
        }
      ];

      const res = validateWorkflowDag(steps, mockRegistry);
      assert.deepStrictEqual(res, { valid: true });

      const sorted = topologicalSort(steps);
      // stepA must be first, stepD must be last
      assert.strictEqual(sorted[0], 'stepA');
      assert.strictEqual(sorted[3], 'stepD');
    });

    test('rejects 3-step cycle (A -> B -> C -> A)', () => {
      const steps = [
        {
          stepKey: 'stepA',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: ['stepC']
        },
        {
          stepKey: 'stepB',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: ['stepA']
        },
        {
          stepKey: 'stepC',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: ['stepB']
        }
      ];

      const res = validateWorkflowDag(steps, mockRegistry);
      assert.strictEqual(res.valid, false);
      if (!res.valid) {
        assert.ok(res.errors.length >= 1);
        const err = res.errors[0];
        assert.strictEqual(err.field, 'steps');
        assert.ok(err.message.includes('Cycle detected'));
        assert.ok(err.message.includes('stepA'));
        assert.ok(err.message.includes('stepB'));
        assert.ok(err.message.includes('stepC'));
      }
    });

    test('rejects unregistered handler', () => {
      const steps = [
        {
          stepKey: 'stepA',
          handlerName: 'unregistered-handler-blah',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: []
        }
      ];

      const res = validateWorkflowDag(steps, mockRegistry);
      assert.strictEqual(res.valid, false);
      if (!res.valid) {
        assert.strictEqual(res.errors.length, 1);
        assert.strictEqual(res.errors[0].field, 'steps[0].handlerName');
        assert.ok(res.errors[0].message.includes('unregistered-handler-blah'));
        assert.ok(res.errors[0].message.includes('stepA'));
      }
    });

    test('rejects dependsOn referencing non-existent step', () => {
      const steps = [
        {
          stepKey: 'stepA',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
          timeoutSeconds: 30,
          dependsOn: ['nonExistent']
        }
      ];

      const res = validateWorkflowDag(steps, mockRegistry);
      assert.strictEqual(res.valid, false);
      if (!res.valid) {
        assert.strictEqual(res.errors.length, 1);
        assert.strictEqual(res.errors[0].field, 'steps[0].dependsOn');
        assert.ok(res.errors[0].message.includes('Step "stepA" depends on non-existent step "nonExistent"'));
      }
    });

    test('rejects out of bounds retry policy and timeouts', () => {
      const steps = [
        {
          stepKey: 'stepA',
          handlerName: 'http-request',
          inputConfig: {},
          retryPolicy: { maxAttempts: 15, baseDelayMs: 50 },
          timeoutSeconds: 4000,
          dependsOn: []
        }
      ];

      const res = validateWorkflowDag(steps, mockRegistry);
      assert.strictEqual(res.valid, false);
      if (!res.valid) {
        assert.ok(res.errors.length >= 3);
        const fields = res.errors.map(e => e.field);
        assert.ok(fields.includes('steps[0].retryPolicy.maxAttempts'));
        assert.ok(fields.includes('steps[0].retryPolicy.baseDelayMs'));
        assert.ok(fields.includes('steps[0].timeoutSeconds'));
      }
    });
  });

  describe('Database Integration Tests', () => {
    let workflowId: string;
    let stepIdA: string;
    let stepIdB: string;
    let stepIdC: string;

    before(async () => {
      workflowId = crypto.randomUUID();
      stepIdA = crypto.randomUUID();
      stepIdB = crypto.randomUUID();
      stepIdC = crypto.randomUUID();

      // Seed parent workflow, steps, dependencies
      await pool.query(
        `INSERT INTO workflows (id, name, created_by) VALUES ($1, $2, $3)`,
        [workflowId, 'Engine Test Workflow', 'test-user']
      );

      await pool.query(
        `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [stepIdA, workflowId, 'stepA', 'http-request', '{}', '{"maxAttempts":3,"baseDelayMs":1000}', 30]
      );

      await pool.query(
        `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [stepIdB, workflowId, 'stepB', 'transform-json', '{}', '{"maxAttempts":2,"baseDelayMs":1000}', 30]
      );

      await pool.query(
        `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name, input_config, retry_policy, timeout_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [stepIdC, workflowId, 'stepC', 'http-request', '{}', '{"maxAttempts":3,"baseDelayMs":1000}', 30]
      );

      await pool.query(
        `INSERT INTO step_dependencies (step_id, depends_on_step_id) VALUES ($1, $2)`,
        [stepIdB, stepIdA]
      );

      await pool.query(
        `INSERT INTO step_dependencies (step_id, depends_on_step_id) VALUES ($1, $2)`,
        [stepIdC, stepIdB]
      );
    });

    after(async () => {
      // Clean up seeded database rows
      await pool.query(`DELETE FROM step_dependencies WHERE step_id IN ($1, $2)`, [stepIdB, stepIdC]);
      await pool.query(`DELETE FROM step_runs WHERE step_id IN ($1, $2, $3)`, [stepIdA, stepIdB, stepIdC]);
      await pool.query(`DELETE FROM workflow_runs WHERE workflow_id = $1`, [workflowId]);
      await pool.query(`DELETE FROM workflow_steps WHERE workflow_id = $1`, [workflowId]);
      await pool.query(`DELETE FROM workflows WHERE id = $1`, [workflowId]);
      await pool.end();
    });

    test('createWorkflowRun creates run and step runs correctly', async () => {
      const inputPayload = { hello: 'world' };
      const runDto = await createWorkflowRun(pool, workflowId, inputPayload, 'test-trigger-user');

      assert.ok(runDto.id);
      assert.strictEqual(runDto.workflowId, workflowId);
      assert.strictEqual(runDto.status, 'RUNNING');
      assert.deepStrictEqual(runDto.inputPayload, inputPayload);
      assert.strictEqual(runDto.triggeredBy, 'test-trigger-user');
      assert.ok(runDto.startedAt);

      assert.strictEqual(runDto.steps.length, 3);

      const stepA = runDto.steps.find(s => s.stepKey === 'stepA')!;
      const stepB = runDto.steps.find(s => s.stepKey === 'stepB')!;
      const stepC = runDto.steps.find(s => s.stepKey === 'stepC')!;

      assert.ok(stepA);
      assert.ok(stepB);
      assert.ok(stepC);

      // stepA is root (no dependencies) -> should be QUEUED
      assert.strictEqual(stepA.status, 'QUEUED');

      // stepB & stepC have dependencies -> should be PENDING
      assert.strictEqual(stepB.status, 'PENDING');
      assert.strictEqual(stepC.status, 'PENDING');

      // Double-check attempt counts and max attempts
      assert.strictEqual(stepA.attemptCount, 0);
      assert.strictEqual(stepA.maxAttempts, 3);
      assert.strictEqual(stepB.maxAttempts, 2);
    });

    test('concurrency: createWorkflowRun twice creates two independent runs', async () => {
      const run1 = await createWorkflowRun(pool, workflowId, { run: 1 }, 'user1');
      const run2 = await createWorkflowRun(pool, workflowId, { run: 2 }, 'user2');

      assert.notStrictEqual(run1.id, run2.id);

      const stepRuns1 = await pool.query(`SELECT id FROM step_runs WHERE workflow_run_id = $1`, [run1.id]);
      const stepRuns2 = await pool.query(`SELECT id FROM step_runs WHERE workflow_run_id = $1`, [run2.id]);

      assert.strictEqual(stepRuns1.rowCount, 3);
      assert.strictEqual(stepRuns2.rowCount, 3);

      // Make sure step run IDs are completely disjoint
      const ids1 = new Set(stepRuns1.rows.map(r => r.id));
      const ids2 = new Set(stepRuns2.rows.map(r => r.id));
      for (const id of ids1) {
        assert.ok(!ids2.has(id));
      }
    });

    test('cancelWorkflowRun updates step runs and workflow runs', async () => {
      // 1. Create a run
      const run = await createWorkflowRun(pool, workflowId, {}, 'cancel-user');

      // 2. Set stepA to RUNNING (simulating worker execution)
      const stepA = run.steps.find(s => s.stepKey === 'stepA')!;
      await pool.query(
        `UPDATE step_runs SET status = 'RUNNING', worker_id = 'worker-1' WHERE id = $1`,
        [stepA.id]
      );

      // 3. Cancel the run
      const count = await cancelWorkflowRun(pool, run.id);
      assert.strictEqual(count, 1);

      // 4. Verify run status is CANCELLED
      const runRes = await pool.query(`SELECT status, completed_at FROM workflow_runs WHERE id = $1`, [run.id]);
      assert.strictEqual(runRes.rows[0].status, 'CANCELLED');
      assert.ok(runRes.rows[0].completed_at);

      // 5. Verify steps status
      const stepsRes = await pool.query(`SELECT step_id, status FROM step_runs WHERE workflow_run_id = $1`, [run.id]);
      const sMap = new Map(stepsRes.rows.map(r => [r.step_id, r.status]));

      // stepA was RUNNING -> should be CANCEL_REQUESTED
      assert.strictEqual(sMap.get(stepIdA), 'CANCEL_REQUESTED');

      // stepB & stepC were PENDING -> should be CANCELLED
      assert.strictEqual(sMap.get(stepIdB), 'CANCELLED');
      assert.strictEqual(sMap.get(stepIdC), 'CANCELLED');
    });

    test('createReplayRun creates a run pre-succeeding prior steps', async () => {
      // 1. Create original run and mock it as completed/failed
      const origRun = await createWorkflowRun(pool, workflowId, { init: 'val' }, 'replay-orig-user');

      // Update original run step runs to simulate partial success:
      // stepA -> SUCCEEDED, stepB -> FAILED
      const origStepA = origRun.steps.find(s => s.stepKey === 'stepA')!;
      const origStepB = origRun.steps.find(s => s.stepKey === 'stepB')!;

      await pool.query(
        `UPDATE step_runs SET status = 'SUCCEEDED', output_payload = '{"result":"stepA-ok"}'::jsonb, completed_at = NOW() WHERE id = $1`,
        [origStepA.id]
      );
      await pool.query(
        `UPDATE step_runs SET status = 'FAILED', error_message = 'Failed stepB', completed_at = NOW() WHERE id = $1`,
        [origStepB.id]
      );
      await pool.query(
        `UPDATE workflow_runs SET status = 'FAILED', completed_at = NOW() WHERE id = $1`,
        [origRun.id]
      );

      // 2. Trigger Replay from stepB
      const replayRun = await createReplayRun(pool, origRun.id, 'stepB', 'replay-trigger-user');

      assert.ok(replayRun.id);
      assert.notStrictEqual(replayRun.id, origRun.id);
      assert.strictEqual(replayRun.originalRunId, origRun.id);
      assert.strictEqual(replayRun.status, 'RUNNING');
      assert.deepStrictEqual(replayRun.inputPayload, { init: 'val' });

      assert.strictEqual(replayRun.steps.length, 3);

      const stepA = replayRun.steps.find(s => s.stepKey === 'stepA')!;
      const stepB = replayRun.steps.find(s => s.stepKey === 'stepB')!;
      const stepC = replayRun.steps.find(s => s.stepKey === 'stepC')!;

      // stepA is before replay point (stepB) -> should be pre-completed as SUCCEEDED with original output
      assert.strictEqual(stepA.status, 'SUCCEEDED');
      assert.deepStrictEqual(stepA.outputPayload, { result: 'stepA-ok' });

      // stepB (replay point) -> should be QUEUED (since its dependency stepA is SUCCEEDED)
      assert.strictEqual(stepB.status, 'QUEUED');

      // stepC (downstream of replay point) -> should be PENDING
      assert.strictEqual(stepC.status, 'PENDING');
    });
  });
});
