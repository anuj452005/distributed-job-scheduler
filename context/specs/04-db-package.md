# Unit 04 — DB Package & Connection Pool

## What This Unit Builds

`packages/db` — the PostgreSQL connection pool and migration runner.
No business logic here. Every other backend package imports the pool
from this package. Migrations are applied at API/worker startup.

**Done looks like:**
- `packages/db` exports a `pool` (node-postgres `Pool`) that connects
  to the Azure PostgreSQL using `DATABASE_URL`.
- The migration runner reads `.sql` files from `packages/db/migrations/`
  in filename order and applies them in a transaction.
- Running `npm run migrate` from the repo root applies all migrations and
  prints each file name as it runs.
- The pool can be imported by other packages and queries execute successfully.

---

## Dependencies

- Unit 01 — Monorepo scaffold with `packages/db` directory.
- Unit 02 — Migration SQL files exist in `packages/db/migrations/`.
- Unit 03 — `@flowforge/shared` types available (for import in later packages).

---

## Files to Create

```
packages/db/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts          # exports: pool, runMigrations
    ├── pool.ts           # creates and exports the pg Pool
    └── migrate.ts        # reads + applies SQL migration files
```

---

## Key Implementation Details

### `pool.ts`

```ts
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});
```

### `migrate.ts`

- Reads all `.sql` files from `packages/db/migrations/` sorted by filename.
- Wraps each migration in a transaction.
- Maintains a `_migrations` table to track which migrations have been applied:
  ```sql
  CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```
- Skips files that already appear in `_migrations`.
- Logs: `Applied migration: 001_create_workflows.sql`.
- On failure, rolls back the transaction and re-throws.

### `index.ts`

```ts
export { pool } from './pool.js';
export { runMigrations } from './migrate.js';
```

### Package scripts (`package.json`)

```json
{
  "scripts": {
    "migrate": "tsx src/migrate.ts",
    "build": "tsc"
  }
}
```

---

## npm Dependencies

```
pg
@types/pg
tsx          (dev — for running TypeScript directly)
```

---

## Verification Checklist

- [ ] `DATABASE_URL` missing → startup throws a clear error message.
- [ ] `npm run migrate` applies all 9 migration files in order without errors.
- [ ] Running `npm run migrate` a second time applies 0 files (idempotent).
- [ ] `psql` confirms `_migrations` table has 9 rows after migration.
- [ ] `pool.query('SELECT 1')` returns without error in a test script.
- [ ] `packages/db` does not import from `packages/engine`, `packages/worker`,
      `packages/handlers`, or `packages/api`.
- [ ] `tsc --noEmit` exits 0 on `packages/db`.
