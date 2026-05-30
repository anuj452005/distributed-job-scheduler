# Unit 01 — Repo Scaffold & Docker Compose

## What This Unit Builds

A runnable monorepo skeleton with a working local development
environment for all subsequent units.

**Cloud services used everywhere (local dev and production):**
PostgreSQL and Redis are **never run locally in Docker**. Even during
local development you connect to your Azure Database for PostgreSQL
(Flexible Server) and Azure Cache for Redis. Set `DATABASE_URL` and
`REDIS_URL` in your `.env` file before running anything.

**Done looks like:**
- `npm install` from the repo root installs all workspace packages.
- `npm run build` across all packages exits 0 (even though packages are empty stubs).
- `docker compose up` starts the `api` and `worker` containers, both of which
  connect successfully to the cloud PostgreSQL and Redis.
- The repo structure matches the System Boundaries table in `architecture.md`.

---

## Dependencies

None. This is the first unit.

---

## Files & Folders to Create

```
distibuted-job-worker/
├── package.json                  # npm workspaces root
├── tsconfig.base.json            # shared tsconfig (strict: true)
├── .env.example                  # template for all env vars
├── .gitignore
├── docker-compose.yml            # api, worker only (postgres + redis are cloud)
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts          # empty export for now
│   ├── db/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── queue/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── engine/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── scheduler/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── worker/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── handlers/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── events/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts
└── packages/dashboard/           # scaffolded with Vite + React + TS + Tailwind
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        └── App.tsx
```

---

## Docker Compose Services

Only the application processes run in Docker locally. All data services
are cloud-hosted and accessed via environment variables.

| Service | Image | Ports | Notes |
|---------|-------|-------|-------|
| `api` | local Dockerfile | `3000:3000` | Reads `DATABASE_URL` + `REDIS_URL` from `.env` |
| `worker` | local Dockerfile | — | Scalable: `--scale worker=N`. Reads same env vars. |

> PostgreSQL and Redis are **not** in Docker Compose.
> They are Azure-managed services accessed via `DATABASE_URL` and `REDIS_URL`.

---

## Environment Variables to Document in `.env.example`

```env
# ─── Database (Azure Database for PostgreSQL — Flexible Server) ───────────────
# Get from: Azure Portal → your PostgreSQL resource → Connection strings
# Format:  postgresql://<user>@<server>:<password>@<host>:5432/<db>?sslmode=require
DATABASE_URL=postgresql://<user>%40<server>:<password>@<host>.postgres.database.azure.com:5432/flowforge?sslmode=require

# ─── Redis (Azure Cache for Redis) ────────────────────────────────────────────
# Get from: Azure Portal → your Redis resource → Access keys
# Always use rediss:// (TLS, port 6380) — never plain redis://
REDIS_URL=rediss://:<accesskey>@<name>.redis.cache.windows.net:6380

# ─── Clerk ────────────────────────────────────────────────────────────────────
# Get from: clerk.com → your app → API Keys
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# ─── Encryption ───────────────────────────────────────────────────────────────
# 32-byte hex string. Generate with: openssl rand -hex 32
ENCRYPTION_KEY=

# ─── Worker ───────────────────────────────────────────────────────────────────
WORKER_POLL_INTERVAL_MS=500
WORKER_LEASE_DURATION_SECONDS=30
WORKER_HEARTBEAT_INTERVAL_SECONDS=10

# ─── Scheduler ────────────────────────────────────────────────────────────────
SCHEDULER_POLL_INTERVAL_MS=5000

# ─── Lease Sweeper ────────────────────────────────────────────────────────────
SWEEPER_POLL_INTERVAL_MS=15000
```

---

## Key Implementation Details

- Root `package.json` uses `"workspaces": ["packages/*"]`.
- `tsconfig.base.json` sets `"strict": true`, `"target": "ES2022"`, `"module": "NodeNext"`.
- Every package `tsconfig.json` extends `../../tsconfig.base.json`.
- `packages/shared` must have no dependencies on other packages (zero imports from `packages/*`).
- Dashboard is scaffolded using `npx create-vite@latest` with the React + TypeScript template
  and Tailwind configured; shadcn/ui is initialized in this unit.

---

## Verification Checklist

- [ ] `DATABASE_URL` and `REDIS_URL` are filled in `.env` pointing to live Azure services.
- [ ] `npm run migrate` connects to Azure PostgreSQL and applies all migrations.
- [ ] `psql $DATABASE_URL -c "SELECT 1"` succeeds.
- [ ] `npm install` from root installs all packages.
- [ ] `npm run build` (or `tsc --noEmit`) passes across all packages.
- [ ] `packages/shared` has zero imports from other workspace packages.
- [ ] `docker compose up` starts `api` and `worker` containers; both connect to cloud DB and Redis without errors.
- [ ] Dashboard dev server starts: `cd packages/dashboard && npm run dev`.
- [ ] `.env.example` contains all variables listed above with Azure connection string format examples.
