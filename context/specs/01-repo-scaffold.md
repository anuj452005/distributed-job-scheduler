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
- `npm run build` (i.e. `tsc --noEmit`) across all packages exits 0 (even though packages are empty stubs).
- `docker compose up` starts the `api` and `worker` containers, both of which
  connect successfully to the cloud PostgreSQL and Redis.
- The repo structure matches the System Boundaries table in `architecture.md`.

---

## Dependencies

None. This is the first unit.

---

## Files & Folders to Create

All paths below are relative to the `flowforge/` directory (the monorepo root that holds `package.json`).

```
flowforge/
├── package.json                  # npm workspaces root
├── tsconfig.base.json            # shared tsconfig (strict: true)
├── .env.example                  # template for all env vars
├── .gitignore
├── docker-compose.yml            # api and worker only — no postgres/redis containers
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
│   ├── events/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── handlers/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── worker/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile            # worker container image
│   │   └── src/index.ts
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile            # api container image
│   │   └── src/index.ts
│   └── dashboard/                # scaffolded with Vite + React + TS + Tailwind
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json    # Vite-specific tsconfig for vite.config.ts
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           └── App.tsx
```

> **Note on the outer repo directory:**
> The git repository root is `distibuted-job-worker/`. The monorepo root (where `npm install` is run) is `distibuted-job-worker/flowforge/`. All `packages/*` paths above are children of `flowforge/`.

---

## Docker Compose Services

Only the application processes run in Docker locally. All data services
are cloud-hosted and accessed via environment variables.

| Service  | Image            | Ports      | Notes |
|----------|------------------|------------|-------|
| `api`    | `packages/api/Dockerfile`    | `3000:3000` | Reads `DATABASE_URL` + `REDIS_URL` from `.env` |
| `worker` | `packages/worker/Dockerfile` | —          | Scalable: `--scale worker=N`. Reads same env vars. |

> PostgreSQL and Redis are **not** in Docker Compose.
> They are Azure-managed services accessed via `DATABASE_URL` and `REDIS_URL`.

---

## Environment Variables to Document in `.env.example`

```env
# ─── Database (Azure Database for PostgreSQL — Flexible Server) ───────────────
# Get from: Azure Portal → your PostgreSQL resource → Connection strings
# Format:  postgresql://<user>%40<server>:<password>@<host>:5432/<db>?sslmode=require
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

- Root `package.json` is at `flowforge/package.json` and uses `"workspaces": ["packages/*"]`.
- `tsconfig.base.json` sets `"strict": true`, `"target": "ES2022"`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`.
- Every **backend** package `tsconfig.json` extends `../../tsconfig.base.json`.
- `packages/dashboard/` uses two tsconfig files:
  - `tsconfig.json` extends `../../tsconfig.base.json` but overrides `"module": "ESNext"` and `"moduleResolution": "Bundler"` (required by Vite).
  - `tsconfig.node.json` covers `vite.config.ts` only.
- `packages/shared` must have **no dependencies** on other workspace packages (zero imports from `packages/*`).
- Dashboard is scaffolded using `npx create-vite@latest` with the React + TypeScript template, Tailwind configured; shadcn/ui is initialized in this unit.
- `packages/api/Dockerfile` and `packages/worker/Dockerfile` should use a Node.js 20 Alpine base image. In this unit they only need to start the stub `src/index.ts`. A full production Dockerfile is refined in Unit 23.
- `docker-compose.yml` loads environment variables from `.env` using the `env_file` directive.

---

## Verification Checklist

- [ ] `DATABASE_URL` and `REDIS_URL` are filled in `.env` pointing to live Azure services.
- [ ] `npm install` from `flowforge/` root installs all packages without errors.
- [ ] `npm run build` (or `tsc --noEmit`) passes across all backend packages with zero TypeScript errors.
- [ ] `packages/shared` has zero imports from other workspace packages.
- [ ] `docker compose up` starts both the `api` and `worker` containers without crash-looping.
- [ ] Container logs show no `ECONNREFUSED` errors for `DATABASE_URL` or `REDIS_URL`.
- [ ] Dashboard dev server starts: `cd packages/dashboard && npm run dev` opens the default Vite + React app.
- [ ] `.env.example` contains all variables listed above with Azure connection string format examples.
