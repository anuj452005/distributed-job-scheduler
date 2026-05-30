import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { pool } from '@flowforge/db';
import crypto from 'crypto';
import { startScheduler, stopScheduler } from './index.js';
import { runRetrySchedulerTick } from './retry-scheduler.js';
import { runLeaseSweeperTick } from './lease-sweeper.js';

describe('Scheduler and Lease Sweeper Integration Tests', () => {
  const workflowId = crypto.randomUUID();
  const workflowRunId = crypto.randomUUID();
  const stepId1 = crypto.randomUUID();
  const stepId2 = crypto.randomUUID();
  const stepId3 = crypto.randomUUID();
  const stepId4 = crypto.randomUUID();
  const workerId = 'scheduler-test-worker';

  before(async () => {
    // Seed parent workflow, steps, workflow run
    await pool.query(
      `INSERT INTO workflows (id, name, created_by) VALUES ($1, $2, $3)`,
      [workflowId, 'Scheduler Test Workflow', 'test-user']
    );

    // Seed multiple steps so we can test concurrently without violating unique constraints
    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name) VALUES ($1, $2, $3, $4)`,
      [stepId1, workflowId, 'step1', 'test-handler']
    );

    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name) VALUES ($1, $2, $3, $4)`,
      [stepId2, workflowId, 'step2', 'test-handler']
    );

    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name) VALUES ($1, $2, $3, $4)`,
      [stepId3, workflowId, 'step3', 'test-handler']
    );

    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name) VALUES ($1, $2, $3, $4)`,
      [stepId4, workflowId, 'step4', 'test-handler']
    );

    await pool.query(
      `INSERT INTO workflow_runs (id, workflow_id, status, triggered_by) VALUES ($1, $2, $3, $4)`,
      [workflowRunId, workflowId, 'RUNNING', 'test-user']
    );
  });

  after(async () => {
    // Clean up all seeded data (cascade deletes should take care of step_runs)
    await pool.query(`DELETE FROM step_runs WHERE workflow_run_id = $1`, [workflowRunId]);
    await pool.query(`DELETE FROM workflow_runs WHERE id = $1`, [workflowRunId]);
    await pool.query(`DELETE FROM workflow_steps WHERE workflow_id = $1`, [workflowId]);
    await pool.query(`DELETE FROM workflows WHERE id = $1`, [workflowId]);
    await pool.end();
  });

  test('startScheduler returns handle with stop, and clean stopScheduler works', async () => {
    process.env.SCHEDULER_POLL_INTERVAL_MS = '50';
    process.env.SWEEPER_POLL_INTERVAL_MS = '50';

    const handle = startScheduler(pool);
    assert.strictEqual(typeof handle.stop, 'function');

    // Verify calling stopScheduler shuts down loops
    stopScheduler();

    // Verify it doesn't crash to stop again
    handle.stop();
  });

  test('retry promotion loop promotions', async () => {
    // 1. Insert a step run in RETRYING state with next_run_at in the past (using stepId1)
    const stepRunId1 = crypto.randomUUID();
    await pool.query(
      `INSERT INTO step_runs (id, workflow_run_id, step_id, status, idempotency_key, attempt_count, max_attempts, next_run_at)
       VALUES ($1, $2, $3, 'RETRYING', 'retry-key-1', 1, 3, NOW() - INTERVAL '10 seconds')`,
      [stepRunId1, workflowRunId, stepId1]
    );

    // 2. Insert a step run in RETRYING state with next_run_at in the future (using stepId2)
    const stepRunId2 = crypto.randomUUID();
    await pool.query(
      `INSERT INTO step_runs (id, workflow_run_id, step_id, status, idempotency_key, attempt_count, max_attempts, next_run_at)
       VALUES ($1, $2, $3, 'RETRYING', 'retry-key-2', 1, 3, NOW() + INTERVAL '1 hour')`,
      [stepRunId2, workflowRunId, stepId2]
    );

    // Run the tick function directly to avoid race conditions
    await runRetrySchedulerTick(pool);

    // Assert stepRunId1 is now QUEUED
    const res1 = await pool.query(`SELECT status FROM step_runs WHERE id = $1`, [stepRunId1]);
    assert.strictEqual(res1.rows[0].status, 'QUEUED');

    // Assert stepRunId2 is still RETRYING
    const res2 = await pool.query(`SELECT status FROM step_runs WHERE id = $1`, [stepRunId2]);
    assert.strictEqual(res2.rows[0].status, 'RETRYING');

    // Clean up
    await pool.query(`DELETE FROM step_runs WHERE id IN ($1, $2)`, [stepRunId1, stepRunId2]);
  });

  test('lease sweeper loop: requeues when attempts remain', async () => {
    // Insert step run in RUNNING with expired lease and attempt_count < max_attempts (using stepId3)
    const stepRunId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO step_runs (id, workflow_run_id, step_id, status, idempotency_key, attempt_count, max_attempts, worker_id, lease_expires_at)
       VALUES ($1, $2, $3, 'RUNNING', 'sweeper-key-1', 1, 3, $4, NOW() - INTERVAL '10 seconds')`,
      [stepRunId, workflowRunId, stepId3, workerId]
    );

    // Run the tick function directly
    await runLeaseSweeperTick(pool);

    // Assert stepRunId is now QUEUED, worker_id is null, and lease_expires_at is null
    const res = await pool.query(
      `SELECT status, worker_id, lease_expires_at FROM step_runs WHERE id = $1`,
      [stepRunId]
    );
    assert.strictEqual(res.rows[0].status, 'QUEUED');
    assert.strictEqual(res.rows[0].worker_id, null);
    assert.strictEqual(res.rows[0].lease_expires_at, null);

    // Clean up
    await pool.query(`DELETE FROM step_runs WHERE id = $1`, [stepRunId]);
  });

  test('lease sweeper loop: dead-letters when no attempts remain and fails workflow run', async () => {
    // 1. Reset workflow run to RUNNING
    await pool.query(`UPDATE workflow_runs SET status = 'RUNNING' WHERE id = $1`, [workflowRunId]);

    // 2. Insert step run in RUNNING with expired lease and attempt_count >= max_attempts (using stepId4)
    const stepRunId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO step_runs (id, workflow_run_id, step_id, status, idempotency_key, attempt_count, max_attempts, worker_id, lease_expires_at)
       VALUES ($1, $2, $3, 'RUNNING', 'sweeper-key-2', 3, 3, $4, NOW() - INTERVAL '10 seconds')`,
      [stepRunId, workflowRunId, stepId4, workerId]
    );

    // Run the tick function directly
    await runLeaseSweeperTick(pool);

    // Assert stepRunId is now DEAD_LETTERED
    const res = await pool.query(`SELECT status FROM step_runs WHERE id = $1`, [stepRunId]);
    assert.strictEqual(res.rows[0].status, 'DEAD_LETTERED');

    // Assert parent workflow run is FAILED
    const wfRes = await pool.query(`SELECT status FROM workflow_runs WHERE id = $1`, [workflowRunId]);
    assert.strictEqual(wfRes.rows[0].status, 'FAILED');

    // Clean up
    await pool.query(`DELETE FROM step_runs WHERE id = $1`, [stepRunId]);
  });
});
