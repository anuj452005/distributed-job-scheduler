import { pool } from '../src/pool.js';

async function runVerification() {
  console.log('--- Database Verification Script Start ---');
  
  // 1. Verify table existence
  console.log('\nChecking table existence...');
  const tableCheck = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('workflow_triggers', 'workflow_trigger_executions')
  `);
  const tables = tableCheck.rows.map((r: any) => r.table_name);
  if (!tables.includes('workflow_triggers')) throw new Error('workflow_triggers table is missing!');
  if (!tables.includes('workflow_trigger_executions')) throw new Error('workflow_trigger_executions table is missing!');
  console.log('✓ Both tables exist.');

  // 2. Verify indexes exist
  console.log('\nChecking indexes existence...');
  const indexCheck = await pool.query(`
    SELECT indexname 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND indexname IN (
        'idx_workflow_triggers_cron',
        'idx_workflow_triggers_webhook_token',
        'idx_workflow_triggers_event',
        'idx_workflow_triggers_workflow',
        'idx_trigger_executions_trigger_id'
      )
  `);
  const indexes = indexCheck.rows.map((r: any) => r.indexname);
  const requiredIndexes = [
    'idx_workflow_triggers_cron',
    'idx_workflow_triggers_webhook_token',
    'idx_workflow_triggers_event',
    'idx_workflow_triggers_workflow',
    'idx_trigger_executions_trigger_id'
  ];
  for (const idx of requiredIndexes) {
    if (!indexes.includes(idx)) {
      throw new Error(`Index ${idx} is missing!`);
    }
  }
  console.log('✓ All 5 indexes exist.');

  // 3. Test constraints, cascades, and idempotency
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create dummy workflow
    console.log('\nCreating dummy workflow...');
    const wfRes = await client.query(`
      INSERT INTO workflows (name, created_by) 
      VALUES ('Verification Test Workflow', 'system:test') 
      RETURNING id
    `);
    const workflowId = wfRes.rows[0].id;
    console.log(`✓ Workflow created with ID: ${workflowId}`);

    // Create dummy trigger
    console.log('\nCreating dummy webhook trigger...');
    const trRes = await client.query(`
      INSERT INTO workflow_triggers (workflow_id, name, type, created_by, updated_by, config) 
      VALUES ($1, 'Verification Test Trigger', 'webhook', 'system:test', 'system:test', '{"webhook_token": "verif-token-123"}') 
      RETURNING id
    `, [workflowId]);
    const triggerId = trRes.rows[0].id;
    console.log(`✓ Trigger created with ID: ${triggerId}`);

    // Create dummy run
    console.log('\nCreating dummy workflow run...');
    const runRes = await client.query(`
      INSERT INTO workflow_runs (workflow_id, triggered_by) 
      VALUES ($1, 'system:test') 
      RETURNING id
    `, [workflowId]);
    const runId = runRes.rows[0].id;
    console.log(`✓ Run created with ID: ${runId}`);

    // Test 3.1: Nullable unique idempotency constraint (multiple NULL keys succeed)
    console.log('\nTesting nullable unique idempotency constraint (multiple NULL keys)...');
    const exec1 = await client.query(`
      INSERT INTO workflow_trigger_executions (trigger_id, workflow_run_id, idempotency_key, source_type)
      VALUES ($1, $2, NULL, 'webhook') RETURNING id
    `, [triggerId, runId]);
    const exec2 = await client.query(`
      INSERT INTO workflow_trigger_executions (trigger_id, workflow_run_id, idempotency_key, source_type)
      VALUES ($1, $2, NULL, 'webhook') RETURNING id
    `, [triggerId, runId]);
    console.log(`✓ Successfully inserted multiple executions with NULL idempotency key: ${exec1.rows[0].id}, ${exec2.rows[0].id}`);

    // Test 3.2: Duplicate non-NULL idempotency key fails
    console.log('\nTesting non-NULL idempotency key uniqueness...');
    await client.query(`
      INSERT INTO workflow_trigger_executions (trigger_id, workflow_run_id, idempotency_key, source_type)
      VALUES ($1, $2, 'delivery-id-abc-123', 'webhook')
    `, [triggerId, runId]);
    
    await client.query('SAVEPOINT idempotency_test');
    try {
      await client.query(`
        INSERT INTO workflow_trigger_executions (trigger_id, workflow_run_id, idempotency_key, source_type)
        VALUES ($1, $2, 'delivery-id-abc-123', 'webhook')
      `, [triggerId, runId]);
      await client.query('RELEASE SAVEPOINT idempotency_test');
      throw new Error('FAILED: Duplicate non-NULL idempotency key was allowed!');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT idempotency_test');
      if (err.code === '23505') {
        console.log('✓ Successfully caught unique constraint violation (error code 23505).');
      } else {
        throw err;
      }
    }

    // Test 3.3: Delete run and verify trigger execution workflow_run_id sets to NULL
    console.log('\nTesting ON DELETE SET NULL on workflow_run_id...');
    const tempRunRes = await client.query(`
      INSERT INTO workflow_runs (workflow_id, triggered_by) 
      VALUES ($1, 'system:test') 
      RETURNING id
    `, [workflowId]);
    const tempRunId = tempRunRes.rows[0].id;
    const tempExecRes = await client.query(`
      INSERT INTO workflow_trigger_executions (trigger_id, workflow_run_id, idempotency_key, source_type)
      VALUES ($1, $2, 'temp-delivery-id', 'webhook') RETURNING id
    `, [triggerId, tempRunId]);
    const tempExecId = tempExecRes.rows[0].id;

    await client.query(`DELETE FROM workflow_runs WHERE id = $1`, [tempRunId]);
    const checkTempExec = await client.query(`
      SELECT workflow_run_id FROM workflow_trigger_executions WHERE id = $1
    `, [tempExecId]);
    if (checkTempExec.rows[0].workflow_run_id !== null) {
      throw new Error('FAILED: workflow_run_id was not set to NULL upon run deletion!');
    }
    console.log('✓ Trigger execution workflow_run_id was set to NULL successfully.');

    // Test 3.4: Delete workflow and verify trigger and execution cascade delete
    console.log('\nTesting ON DELETE CASCADE on workflow_triggers & executions...');
    
    // Check they exist first
    const trigCheckBefore = await client.query('SELECT COUNT(*)::int FROM workflow_triggers WHERE id = $1', [triggerId]);
    const execCheckBefore = await client.query('SELECT COUNT(*)::int FROM workflow_trigger_executions WHERE trigger_id = $1', [triggerId]);
    if (trigCheckBefore.rows[0].count === 0 || execCheckBefore.rows[0].count === 0) {
      throw new Error('Setup failure: triggers or executions missing before delete cascade test.');
    }

    // Perform cascade delete of workflow
    // First, delete all runs referencing this workflow to satisfy the foreign key constraint
    await client.query('DELETE FROM workflow_runs WHERE workflow_id = $1', [workflowId]);
    await client.query('DELETE FROM workflows WHERE id = $1', [workflowId]);
    
    const trigCheckAfter = await client.query('SELECT COUNT(*)::int FROM workflow_triggers WHERE id = $1', [triggerId]);
    const execCheckAfter = await client.query('SELECT COUNT(*)::int FROM workflow_trigger_executions WHERE trigger_id = $1', [triggerId]);
    if (trigCheckAfter.rows[0].count !== 0) {
      throw new Error('FAILED: workflow_triggers row was not cascade deleted!');
    }
    if (execCheckAfter.rows[0].count !== 0) {
      throw new Error('FAILED: workflow_trigger_executions row was not cascade deleted!');
    }
    console.log('✓ Workflow triggers and executions cascade deleted successfully.');

    console.log('\nAll database verification checks passed successfully!');
    await client.query('ROLLBACK'); // Rollback test data to keep DB clean
    console.log('✓ Rolled back test transactions successfully. Database is clean.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

runVerification()
  .then(() => {
    console.log('\nVerification completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nVerification failed:', err);
    process.exit(1);
  });
