import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Search up the directory structure to find .env file
let currentDir = __dirname;
for (let i = 0; i < 5; i++) {
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

// Convert JDBC URL format to standard PostgreSQL format
if (databaseUrl.startsWith('jdbc:postgresql://')) {
  databaseUrl = databaseUrl.replace('jdbc:postgresql://', 'postgresql://');
}

// If username and password are provided separately and not already embedded in the URL, merge them
if (process.env.DATABASE_USERNAME && process.env.DATABASE_PASSWORD && !databaseUrl.includes('@')) {
  const urlParts = databaseUrl.split('://');
  if (urlParts.length === 2) {
    const encodedUser = encodeURIComponent(process.env.DATABASE_USERNAME);
    const encodedPass = encodeURIComponent(process.env.DATABASE_PASSWORD);
    databaseUrl = `${urlParts[0]}://${encodedUser}:${encodedPass}@${urlParts[1]}`;
  }
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 30_000,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected PostgreSQL pool error', err);
});
