import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.resolve(__dirname, '../migrations');

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. Create _migrations table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Read and sort SQL migration files
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    // 3. Get already applied migrations
    const { rows } = await client.query('SELECT filename FROM _migrations');
    const appliedMigrations = new Set(rows.map((row: { filename: string }) => row.filename));

    let appliedCount = 0;

    // 4. Run unapplied migrations sequentially
    for (const file of files) {
      if (appliedMigrations.has(file)) {
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // Execute each migration inside a dedicated transaction block
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied migration: ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error applying migration ${file}, transaction rolled back.`);
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log('No new migrations to apply. Database schema is up-to-date.');
    } else {
      console.log(`Successfully applied ${appliedCount} migration(s).`);
    }
  } finally {
    client.release();
  }
}

// Check if this module is being run directly as a script (CLI entrypoint)
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('migrate.ts') ||
  process.argv[1].endsWith('migrate.js')
);

if (isMain) {
  runMigrations()
    .then(() => {
      console.log('Migration runner finished successfully.');
      return pool.end();
    })
    .catch((err) => {
      console.error('Migration runner failed:', err);
      pool.end().finally(() => process.exit(1));
    });
}
