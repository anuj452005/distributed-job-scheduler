import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { pool } from '@flowforge/db';
import crypto from 'crypto';
import { startScheduler, stopScheduler } from './index.js';
import { runRetrySchedulerTick } from './retry-scheduler.js';
import { runLeaseSweeperTick } from './lease-sweeper.js';
import { runCronSchedulerTick, resolveMisfireTimes } from './cron-scheduler.js';

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

  test('cron misfire policy resolver', () => {
    const lastScheduled = new Date('2026-06-05T10:00:00Z');
    const cronExpr = '*/5 * * * *'; // every 5 minutes

    // SKIP: always returns [lastScheduled]
    const skipRes = resolveMisfireTimes(lastScheduled, cronExpr, 'SKIP', new Date('2026-06-05T10:12:00Z'));
    assert.deepStrictEqual(skipRes, [lastScheduled]);

    // RUN_ONCE: returns only the most recently missed scheduled time
    const runOnceRes = resolveMisfireTimes(lastScheduled, cronExpr, 'RUN_ONCE', new Date('2026-06-05T10:12:00Z'));
    assert.deepStrictEqual(runOnceRes, [new Date('2026-06-05T10:10:00Z')]);

    // CATCH_UP: returns all missed scheduled times (back-fill)
    const catchUpRes = resolveMisfireTimes(lastScheduled, cronExpr, 'CATCH_UP', new Date('2026-06-05T10:12:00Z'));
    assert.deepStrictEqual(catchUpRes, [
      new Date('2026-06-05T10:05:00Z'),
      new Date('2026-06-05T10:10:00Z')
    ]);

    // If no missed fires, fallbacks to [lastScheduled]
    const fallbackRes = resolveMisfireTimes(lastScheduled, cronExpr, 'RUN_ONCE', new Date('2026-06-05T10:02:00Z'));
    assert.deepStrictEqual(fallbackRes, [lastScheduled]);
  });

  test('cron scheduler loop: claim and advance with SKIP misfire policy', async () => {
    const triggerId = crypto.randomUUID();
    
    // Insert ACTIVE cron trigger due 1 minute ago
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, next_fire_at, created_by, updated_by)
       VALUES ($1, $2, $3, 'cron', 'ACTIVE', $4, NOW() - INTERVAL '1 minute', 'system:test', 'system:test')`,
      [triggerId, workflowId, 'Test SKIP Trigger', JSON.stringify({ cron: '*/5 * * * *', misfire_policy: 'SKIP' })]
    );

    // Execute the tick
    await runCronSchedulerTick(pool);

    // Assert the trigger's next_fire_at was advanced and last_fired_at was set
    const trigRes = await pool.query(
      `SELECT next_fire_at, last_fired_at FROM workflow_triggers WHERE id = $1`,
      [triggerId]
    );
    const trig = trigRes.rows[0];
    assert.ok(trig.next_fire_at.getTime() > Date.now());
    assert.ok(trig.last_fired_at);

    // Assert that execution was tracked and run was created
    const execRes = await pool.query(
      `SELECT status, workflow_run_id, payload FROM workflow_trigger_executions WHERE trigger_id = $1`,
      [triggerId]
    );
    assert.strictEqual(execRes.rows.length, 1);
    assert.strictEqual(execRes.rows[0].status, 'SUCCEEDED');
    assert.ok(execRes.rows[0].workflow_run_id);
    
    const runRes = await pool.query(
      `SELECT status, triggered_by FROM workflow_runs WHERE id = $1`,
      [execRes.rows[0].workflow_run_id]
    );
    assert.strictEqual(runRes.rows.length, 1);
    assert.strictEqual(runRes.rows[0].triggered_by, 'system:cron');

    // Clean up
    await pool.query(`DELETE FROM workflow_trigger_executions WHERE trigger_id = $1`, [triggerId]);
    await pool.query(`DELETE FROM workflow_runs WHERE workflow_id = $1 AND id != $2`, [workflowId, workflowRunId]);
    await pool.query(`DELETE FROM workflow_triggers WHERE id = $1`, [triggerId]);
  });

  test('cron scheduler loop: claim and advance with CATCH_UP misfire policy', async () => {
    const triggerId = crypto.randomUUID();
    
    // Insert ACTIVE cron trigger due 11 minutes ago
    // A schedule of */5 * * * * starting from 11 mins ago will yield multiple missed executions
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, next_fire_at, created_by, updated_by)
       VALUES ($1, $2, $3, 'cron', 'ACTIVE', $4, NOW() - INTERVAL '11 minutes', 'system:test', 'system:test')`,
      [triggerId, workflowId, 'Test CATCH_UP Trigger', JSON.stringify({ cron: '*/5 * * * *', misfire_policy: 'CATCH_UP' })]
    );

    // Execute the tick
    await runCronSchedulerTick(pool);

    // Assert that execution was tracked for multiple runs (at least 2 missed runs)
    const execRes = await pool.query(
      `SELECT status, workflow_run_id FROM workflow_trigger_executions WHERE trigger_id = $1`,
      [triggerId]
    );
    assert.ok(execRes.rows.length >= 2);
    for (const row of execRes.rows) {
      assert.strictEqual(row.status, 'SUCCEEDED');
      assert.ok(row.workflow_run_id);
    }

    // Clean up
    await pool.query(`DELETE FROM workflow_trigger_executions WHERE trigger_id = $1`, [triggerId]);
    await pool.query(`DELETE FROM workflow_runs WHERE workflow_id = $1 AND id != $2`, [workflowId, workflowRunId]);
    await pool.query(`DELETE FROM workflow_triggers WHERE id = $1`, [triggerId]);
  });

  test('cron scheduler loop: disables invalid cron configurations', async () => {
    const triggerId = crypto.randomUUID();
    
    // Insert ACTIVE cron trigger with invalid cron config
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, next_fire_at, created_by, updated_by)
       VALUES ($1, $2, $3, 'cron', 'ACTIVE', $4, NOW() - INTERVAL '1 minute', 'system:test', 'system:test')`,
      [triggerId, workflowId, 'Test Invalid Trigger', JSON.stringify({ cron: 'invalid-cron-string', misfire_policy: 'SKIP' })]
    );

    // Execute the tick (must not throw, must catch error and disable)
    await runCronSchedulerTick(pool);

    // Assert trigger is now DISABLED
    const trigRes = await pool.query(
      `SELECT status FROM workflow_triggers WHERE id = $1`,
      [triggerId]
    );
    assert.strictEqual(trigRes.rows[0].status, 'DISABLED');

    // Assert no executions were created
    const execRes = await pool.query(
      `SELECT id FROM workflow_trigger_executions WHERE trigger_id = $1`,
      [triggerId]
    );
    assert.strictEqual(execRes.rows.length, 0);

    // Clean up
    await pool.query(`DELETE FROM workflow_triggers WHERE id = $1`, [triggerId]);
  });

  test('cron scheduler loop: concurrent safety (SKIP LOCKED)', async () => {
    const triggerId = crypto.randomUUID();
    
    // Insert ACTIVE cron trigger due 1 minute ago
    await pool.query(
      `INSERT INTO workflow_triggers (id, workflow_id, name, type, status, config, next_fire_at, created_by, updated_by)
       VALUES ($1, $2, $3, 'cron', 'ACTIVE', $4, NOW() - INTERVAL '1 minute', 'system:test', 'system:test')`,
      [triggerId, workflowId, 'Test Concurrent Trigger', JSON.stringify({ cron: '0 0 1 1 *', misfire_policy: 'SKIP' })]
    );

    // Run concurrently
    await Promise.all([
      runCronSchedulerTick(pool),
      runCronSchedulerTick(pool)
    ]);

    // Assert only 1 execution exists (other one skipped safely because of SKIP LOCKED)
    const execRes = await pool.query(
      `SELECT id FROM workflow_trigger_executions WHERE trigger_id = $1`,
      [triggerId]
    );
    assert.strictEqual(execRes.rows.length, 1);

    // Clean up
    await pool.query(`DELETE FROM workflow_trigger_executions WHERE trigger_id = $1`, [triggerId]);
    await pool.query(`DELETE FROM workflow_runs WHERE workflow_id = $1 AND id != $2`, [workflowId, workflowRunId]);
    await pool.query(`DELETE FROM workflow_triggers WHERE id = $1`, [triggerId]);
  });
});
