import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { pool } from '@flowforge/db';
import {
  claimNextStep,
  commitStepSuccess,
  commitStepFailure,
  refreshLease,
  sweepExpiredLeases,
  promoteDownstreamSteps,
  promoteDelayedRetries
} from './index.js';
import crypto from 'crypto';

describe('Queue Package Unit Tests', () => {
  const workflowId = crypto.randomUUID();
  const workflowRunId = crypto.randomUUID();
  const stepId1 = crypto.randomUUID();
  const stepId2 = crypto.randomUUID();
  const stepRunId1 = crypto.randomUUID();
  const stepRunId2 = crypto.randomUUID();
  const workerId = 'test-worker-1';

  before(async () => {
    // 1. Seed parent workflow, steps, workflow run
    await pool.query(
      `INSERT INTO workflows (id, name, created_by) VALUES ($1, $2, $3)`,
      [workflowId, 'Test Workflow', 'test-user']
    );

    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name) VALUES ($1, $2, $3, $4)`,
      [stepId1, workflowId, 'step1', 'test-handler']
    );

    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name) VALUES ($1, $2, $3, $4)`,
      [stepId2, workflowId, 'step2', 'test-handler']
    );

    await pool.query(
      `INSERT INTO step_dependencies (step_id, depends_on_step_id) VALUES ($1, $2)`,
      [stepId2, stepId1]
    );

    await pool.query(
      `INSERT INTO workflow_runs (id, workflow_id, status, triggered_by) VALUES ($1, $2, $3, $4)`,
      [workflowRunId, workflowId, 'RUNNING', 'test-user']
    );
  });

  after(async () => {
    // Clean up all seeded data (cascade will take care of step_runs / step_dependencies if needed)
    await pool.query(`DELETE FROM step_runs WHERE workflow_run_id = $1`, [workflowRunId]);
    await pool.query(`DELETE FROM step_dependencies WHERE step_id = $1 OR depends_on_step_id = $1`, [stepId2]);
    await pool.query(`DELETE FROM workflow_runs WHERE id = $1`, [workflowRunId]);
    await pool.query(`DELETE FROM workflow_steps WHERE workflow_id = $1`, [workflowId]);
    await pool.query(`DELETE FROM workflows WHERE id = $1`, [workflowId]);
    await pool.end();
  });

  test('claimNextStep & concurrent claim', async () => {
    // 1. Insert a queued step run
    await pool.query(
      `INSERT INTO step_runs (id, workflow_run_id, step_id, status, idempotency_key, priority)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [stepRunId1, workflowRunId, stepId1, 'QUEUED', 'key-1', 10]
    );

    // 2. Claim next step
    const claimed = await claimNextStep(pool, workerId, 30);
    assert.ok(claimed);
    assert.strictEqual(claimed.id, stepRunId1);
    assert.strictEqual(claimed.status, 'RUNNING');
    assert.strictEqual(claimed.worker_id, workerId);
    assert.ok(claimed.lease_expires_at);

    // 3. Second concurrent claim should return null
    const secondClaim = await claimNextStep(pool, 'worker-2', 30);
    assert.strictEqual(secondClaim, null);
  });

  test('commitStepSuccess and fencing logic', async () => {
    // 1. Success commit with correct worker_id
    const successRowVal = await commitStepSuccess(pool, stepRunId1, workerId, { result: 'ok' });
    assert.strictEqual(successRowVal, 1);

    // Check status in DB
    const res = await pool.query(`SELECT status, output_payload FROM step_runs WHERE id = $1`, [stepRunId1]);
    assert.strictEqual(res.rows[0].status, 'SUCCEEDED');
    assert.deepStrictEqual(res.rows[0].output_payload, { result: 'ok' });

    // 2. Fencing check: try committing already finished or wrong worker
    const wrongWorkerRowVal = await commitStepSuccess(pool, stepRunId1, 'wrong-worker', { result: 'bad' });
    assert.strictEqual(wrongWorkerRowVal, 0);
  });

  test('commitStepFailure with retries and dead-letter', async () => {
    // 1. Setup step run 2 as RUNNING
    await pool.query(
      `INSERT INTO step_runs (id, workflow_run_id, step_id, status, idempotency_key, attempt_count, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [stepRunId2, workflowRunId, stepId2, 'RUNNING', 'key-2', 1, 3]
    );

    // Update worker and lease so it looks like it is currently executing
    await pool.query(
      `UPDATE step_runs SET worker_id = $1, lease_expires_at = NOW() + INTERVAL '30 seconds' WHERE id = $2`,
      [workerId, stepRunId2]
    );

    // 2. Commit failure with attempt_count < max_attempts (should retry)
    const failRes1 = await commitStepFailure(pool, stepRunId2, workerId, 'First error message', { maxAttempts: 3, baseDelayMs: 100 });
    assert.strictEqual(failRes1, 1);

    const checkRes1 = await pool.query(`SELECT status, attempt_count, error_message FROM step_runs WHERE id = $1`, [stepRunId2]);
    assert.strictEqual(checkRes1.rows[0].status, 'RETRYING');
    assert.strictEqual(checkRes1.rows[0].error_message, 'First error message');

    // 3. Promote back to RUNNING to simulate next retry
    await pool.query(
      `UPDATE step_runs SET status = 'RUNNING', attempt_count = 3, worker_id = $1, lease_expires_at = NOW() + INTERVAL '30 seconds' WHERE id = $2`,
      [workerId, stepRunId2]
    );

    // 4. Commit failure with attempt_count >= max_attempts (should dead-letter)
    const failRes2 = await commitStepFailure(pool, stepRunId2, workerId, 'Final error message', { maxAttempts: 3, baseDelayMs: 100 });
    assert.strictEqual(failRes2, 1);

    const checkRes2 = await pool.query(`SELECT status, error_message FROM step_runs WHERE id = $1`, [stepRunId2]);
    assert.strictEqual(checkRes2.rows[0].status, 'DEAD_LETTERED');
    assert.strictEqual(checkRes2.rows[0].error_message, 'Final error message');

    // Workflow run should now be FAILED
    const wfRes = await pool.query(`SELECT status FROM workflow_runs WHERE id = $1`, [workflowRunId]);
    assert.strictEqual(wfRes.rows[0].status, 'FAILED');
  });

  test('commitStepSuccess with expired lease', async () => {
    const expiredStepId = crypto.randomUUID();
    const expiredStepRunId = crypto.randomUUID();
    
    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name) VALUES ($1, $2, $3, $4)`,
      [expiredStepId, workflowId, 'expired-step-2', 'test-handler']
    );

    await pool.query(
      `INSERT INTO step_runs (id, workflow_run_id, step_id, status, idempotency_key, attempt_count, max_attempts, worker_id, lease_expires_at)
       VALUES ($1, $2, $3, 'RUNNING', 'key-expired-2', 1, 3, $4, NOW() - INTERVAL '10 seconds')`,
      [expiredStepRunId, workflowRunId, expiredStepId, workerId]
    );

    const commitRes = await commitStepSuccess(pool, expiredStepRunId, workerId, { result: 'too-late' });
    assert.strictEqual(commitRes, 0);

    // Clean up
    await pool.query(`DELETE FROM step_runs WHERE id = $1`, [expiredStepRunId]);
    await pool.query(`DELETE FROM workflow_steps WHERE id = $1`, [expiredStepId]);
  });

  test('sweepExpiredLeases and promoteDelayedRetries', async () => {
    // 1. Reset workflow run to RUNNING
    await pool.query(`UPDATE workflow_runs SET status = 'RUNNING' WHERE id = $1`, [workflowRunId]);

    // 2. Insert step run with expired lease, attempts < max
    const expiredStepId = crypto.randomUUID();
    const expiredStepRunId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name) VALUES ($1, $2, $3, $4)`,
      [expiredStepId, workflowId, 'expired-step', 'test-handler']
    );

    await pool.query(
      `INSERT INTO step_runs (id, workflow_run_id, step_id, status, idempotency_key, attempt_count, max_attempts, worker_id, lease_expires_at)
       VALUES ($1, $2, $3, 'RUNNING', 'key-expired', 1, 3, $4, NOW() - INTERVAL '10 seconds')`,
      [expiredStepRunId, workflowRunId, expiredStepId, workerId]
    );

    // Sweep
    const sweepRes = await sweepExpiredLeases(pool);
    assert.ok(sweepRes.requeued.includes(expiredStepRunId));

    // Verify it is QUEUED now
    const checkRes = await pool.query(`SELECT status FROM step_runs WHERE id = $1`, [expiredStepRunId]);
    assert.strictEqual(checkRes.rows[0].status, 'QUEUED');

    // Clean up the extra step and run
    await pool.query(`DELETE FROM step_runs WHERE id = $1`, [expiredStepRunId]);
    await pool.query(`DELETE FROM workflow_steps WHERE id = $1`, [expiredStepId]);
  });

  test('sweepExpiredLeases dead-letters when max attempts reached', async () => {
    const expiredStepId = crypto.randomUUID();
    const expiredStepRunId = crypto.randomUUID();
    
    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name) VALUES ($1, $2, $3, $4)`,
      [expiredStepId, workflowId, 'expired-step-3', 'test-handler']
    );

    await pool.query(
      `INSERT INTO step_runs (id, workflow_run_id, step_id, status, idempotency_key, attempt_count, max_attempts, worker_id, lease_expires_at)
       VALUES ($1, $2, $3, 'RUNNING', 'key-expired-3', 3, 3, $4, NOW() - INTERVAL '10 seconds')`,
      [expiredStepRunId, workflowRunId, expiredStepId, workerId]
    );

    const sweepRes = await sweepExpiredLeases(pool);
    assert.ok(sweepRes.deadLettered.includes(expiredStepRunId));

    const checkRes = await pool.query(`SELECT status FROM step_runs WHERE id = $1`, [expiredStepRunId]);
    assert.strictEqual(checkRes.rows[0].status, 'DEAD_LETTERED');

    // Clean up
    await pool.query(`DELETE FROM step_runs WHERE id = $1`, [expiredStepRunId]);
    await pool.query(`DELETE FROM workflow_steps WHERE id = $1`, [expiredStepId]);
  });

  test('promoteDelayedRetries scheduler test', async () => {
    const retryStepId = crypto.randomUUID();
    const retryStepRunId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO workflow_steps (id, workflow_id, step_key, handler_name) VALUES ($1, $2, $3, $4)`,
      [retryStepId, workflowId, 'retry-step', 'test-handler']
    );

    await pool.query(
      `INSERT INTO step_runs (id, workflow_run_id, step_id, status, idempotency_key, attempt_count, max_attempts, next_run_at)
       VALUES ($1, $2, $3, 'RETRYING', 'key-retry', 1, 3, NOW() - INTERVAL '10 seconds')`,
      [retryStepRunId, workflowRunId, retryStepId]
    );

    const promotedCount = await promoteDelayedRetries(pool);
    assert.ok(promotedCount >= 1);

    const checkRes = await pool.query(`SELECT status FROM step_runs WHERE id = $1`, [retryStepRunId]);
    assert.strictEqual(checkRes.rows[0].status, 'QUEUED');

    // Clean up
    await pool.query(`DELETE FROM step_runs WHERE id = $1`, [retryStepRunId]);
    await pool.query(`DELETE FROM workflow_steps WHERE id = $1`, [retryStepId]);
  });
});
