import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
let currentDir = __dirname;
for (let i = 0; i < 10; i++) {
  const envPath = path.join(currentDir, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
  const parentDir = path.dirname(currentDir);
  if (parentDir === currentDir) break;
  currentDir = parentDir;
}

let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

if (databaseUrl.startsWith('jdbc:postgresql://')) {
  databaseUrl = databaseUrl.replace('jdbc:postgresql://', 'postgresql://');
}

if (process.env.DATABASE_USERNAME && process.env.DATABASE_PASSWORD && !databaseUrl.includes('@')) {
  const urlParts = databaseUrl.split('://');
  if (urlParts.length === 2) {
    const encodedUser = encodeURIComponent(process.env.DATABASE_USERNAME);
    const encodedPass = encodeURIComponent(process.env.DATABASE_PASSWORD);
    databaseUrl = `${urlParts[0]}://${encodedUser}:${encodedPass}@${urlParts[1]}`;
  }
}

const pool = new Pool({ connectionString: databaseUrl });

async function check() {
  const client = await pool.connect();
  try {
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables in public schema:');
    console.log(tablesRes.rows.map((r: any) => r.table_name));

    try {
      const migrationsRes = await client.query('SELECT * FROM _migrations');
      console.log('Migrations table rows:');
      console.log(migrationsRes.rows);
    } catch (e) {
      console.log('_migrations table does not exist or error querying it:', (e as Error).message);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
