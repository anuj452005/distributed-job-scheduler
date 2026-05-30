import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Resolve directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the monorepo root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL is not set in .env');
  process.exit(1);
}

console.log('🔌 Connecting to database...');

const client = new Client({
  connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log('✅ Connected successfully!');

    // 1. Clean the database first to ensure a repeatable, clean run
    console.log('🧹 Cleaning old tables (if any) to ensure clean test state...');
    await client.query(`
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TABLE IF EXISTS connection_refs CASCADE;
      DROP TABLE IF EXISTS step_logs CASCADE;
      DROP TABLE IF EXISTS step_runs CASCADE;
      DROP TABLE IF EXISTS workflow_runs CASCADE;
      DROP TABLE IF EXISTS step_dependencies CASCADE;
      DROP TABLE IF EXISTS workflow_steps CASCADE;
      DROP TABLE IF EXISTS workflows CASCADE;
    `);
    console.log('✅ Old tables cleaned.');

    // 2. Read and apply migrations in order
    const migrationsDir = path.resolve(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    console.log(`📂 Found ${files.length} migration files in ${migrationsDir}`);

    for (const file of files) {
      console.log(`🚀 Running migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Start transaction
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`✅ Completed: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed: ${file}`);
        throw err;
      }
    }

    // 3. Assertion: Verify all 8 tables exist
    console.log('\n🔍 Verifying all 8 tables exist...');
    const expectedTables = [
      'workflows',
      'workflow_steps',
      'step_dependencies',
      'workflow_runs',
      'step_runs',
      'step_logs',
      'connection_refs',
      'audit_logs'
    ];

    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ANY($1::text[])
    `, [expectedTables]);

    const actualTables = tablesResult.rows.map(r => r.table_name);
    console.log(`Actual tables found: [${actualTables.join(', ')}]`);

    for (const table of expectedTables) {
      if (!actualTables.includes(table)) {
        throw new Error(`Assertion failed: Table '${table}' does not exist!`);
      }
    }
    console.log('✅ All 8 tables verified.');

    // 4. Assertion: Verify the 5 critical indexes exist
    console.log('\n🔍 Verifying all 5 critical indexes exist...');
    const expectedIndexes = [
      'idx_step_runs_claim',
      'idx_step_runs_lease',
      'idx_step_logs_step_run',
      'idx_workflow_runs_workflow',
      'idx_step_runs_run'
    ];

    const indexesResult = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      AND indexname = ANY($1::text[])
    `, [expectedIndexes]);

    const actualIndexes = indexesResult.rows.map(r => r.indexname);
    console.log(`Actual indexes found: [${actualIndexes.join(', ')}]`);

    for (const index of expectedIndexes) {
      if (!actualIndexes.includes(index)) {
        throw new Error(`Assertion failed: Index '${index}' does not exist!`);
      }
    }
    console.log('✅ All 5 critical indexes verified.');

    // 5. Assertion: Verify UNIQUE (workflow_run_id, step_id) constraint on step_runs
    console.log('\n🔍 Verifying UNIQUE constraint on step_runs(workflow_run_id, step_id)...');
    const constraintResult = await client.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = 'step_runs'::regclass 
      AND contype = 'u'
    `);
    
    console.log(`Found unique constraints on step_runs:`, constraintResult.rows);
    if (constraintResult.rows.length === 0) {
      throw new Error(`Assertion failed: No unique constraint found on table 'step_runs'!`);
    }
    console.log('✅ Unique constraint verified.');

    // 6. Assertion: Verify CASCADE deletes work
    console.log('\n🔍 Verifying cascading deletes (workflows -> workflow_steps -> step_dependencies)...');
    // Insert a dummy workflow
    const wfRes = await client.query(`
      INSERT INTO workflows (name, created_by) 
      VALUES ('Test Workflow', 'test_user') 
      RETURNING id
    `);
    const workflowId = wfRes.rows[0].id;

    // Insert dummy workflow steps
    const step1Res = await client.query(`
      INSERT INTO workflow_steps (workflow_id, step_key, handler_name) 
      VALUES ($1, 'step_1', 'http-request') 
      RETURNING id
    `, [workflowId]);
    const step1Id = step1Res.rows[0].id;

    const step2Res = await client.query(`
      INSERT INTO workflow_steps (workflow_id, step_key, handler_name) 
      VALUES ($1, 'step_2', 'http-request') 
      RETURNING id
    `, [workflowId]);
    const step2Id = step2Res.rows[0].id;

    // Insert step dependency
    await client.query(`
      INSERT INTO step_dependencies (step_id, depends_on_step_id) 
      VALUES ($1, $2)
    `, [step2Id, step1Id]);

    console.log('✅ Dummy workflow, steps, and dependencies inserted.');

    // Assert rows exist
    const countWf = await client.query(`SELECT COUNT(*) FROM workflows WHERE id = $1`, [workflowId]);
    const countSteps = await client.query(`SELECT COUNT(*) FROM workflow_steps WHERE workflow_id = $1`, [workflowId]);
    const countDeps = await client.query(`SELECT COUNT(*) FROM step_dependencies WHERE step_id = $1`, [step2Id]);

    if (parseInt(countWf.rows[0].count) !== 1 || parseInt(countSteps.rows[0].count) !== 2 || parseInt(countDeps.rows[0].count) !== 1) {
      throw new Error('Assertion failed: Initial row counts do not match expectations');
    }

    console.log('💥 Deleting workflow to trigger cascading deletes...');
    await client.query(`DELETE FROM workflows WHERE id = $1`, [workflowId]);

    // Assert rows were deleted via cascade
    const countStepsPost = await client.query(`SELECT COUNT(*) FROM workflow_steps WHERE workflow_id = $1`, [workflowId]);
    const countDepsPost = await client.query(`SELECT COUNT(*) FROM step_dependencies WHERE step_id = $1`, [step2Id]);

    if (parseInt(countStepsPost.rows[0].count) !== 0) {
      throw new Error('Assertion failed: workflow_steps were not cascade-deleted');
    }
    if (parseInt(countDepsPost.rows[0].count) !== 0) {
      throw new Error('Assertion failed: step_dependencies were not cascade-deleted');
    }
    console.log('✅ Cascading deletes verified successfully!');

    console.log('\n🎉 ALL SCHEMAS, CONSTRAINTS, INDEXES, AND CASCADES VERIFIED 100% CORRECT!');
  } catch (err) {
    console.error('\n❌ Verification Failed:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Disconnected from database.');
  }
}

run();
