# Unit 11 — API Server Foundation & Auth

## What This Unit Builds

`packages/api` — the Fastify HTTP server that boots, registers the Clerk
JWT middleware, and enforces `operator` / `viewer` roles on every
protected route. No business routes yet — just the server skeleton,
auth middleware, error handler, and health check.

**Done looks like:**
- `GET /health` returns `{ status: "ok" }` without authentication.
- `GET /api/workflows` (placeholder) returns `401` when called without
  a valid Clerk JWT.
- `GET /api/workflows` returns `200 { data: [] }` when called with a
  valid Clerk JWT for an `operator` user.
- A `viewer` user calling `POST /api/workflows` receives `403`.
- `npm run dev` (or `docker compose up`) starts the server on port 3000.

---

## Dependencies

- Unit 01 — Monorepo scaffold.
- Unit 03 — `@flowforge/shared` types (`UserRole`).
- Unit 04 — `packages/db` pool + migration runner (migrations run on startup).
- Unit 08 — `packages/scheduler` started on API boot.

---

## Files to Create

```
packages/api/
├── package.json
├── tsconfig.json
├── Dockerfile
└── src/
    ├── index.ts              # entry point: creates server + starts listening
    ├── server.ts             # builds and exports the Fastify instance
    ├── middleware/
    │   ├── auth.ts           # Clerk JWT verification preHandler
    │   └── role-guard.ts     # operator-only route guard
    ├── routes/
    │   └── health.ts         # GET /health
    ├── error-handler.ts      # global Fastify error handler
    └── config.ts             # reads and validates env vars with Zod
```

---

## Key Implementation Details

### `config.ts`

Parse and validate all environment variables at startup using Zod.
Fail fast with a clear message if any required variable is missing.

```ts
const ConfigSchema = z.object({
  DATABASE_URL:           z.string().url(),
  REDIS_URL:              z.string(),
  CLERK_SECRET_KEY:       z.string().min(1),
  CLERK_PUBLISHABLE_KEY:  z.string().min(1),
  PORT:                   z.coerce.number().default(3000),
  SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  SWEEPER_POLL_INTERVAL_MS:   z.coerce.number().default(15000),
});

export const config = ConfigSchema.parse(process.env);
```

### `server.ts`

```ts
import Fastify from 'fastify';
import { clerkPlugin, getAuth } from '@clerk/fastify';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // Clerk JWT verification
  await app.register(clerkPlugin, {
    secretKey: config.CLERK_SECRET_KEY,
  });

  // Global error handler
  app.setErrorHandler(errorHandler);

  // Routes
  await app.register(healthRoutes);
  // Other route groups registered in later units

  return app;
}
```

### `middleware/auth.ts`

Fastify `preHandler` hook attached to all routes under `/api/`:

```ts
export const requireAuth: preHandlerHookHandler = async (request, reply) => {
  const auth = getAuth(request);
  if (!auth.userId) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }
  // Attach role to request for use in route handlers
  request.userRole = auth.sessionClaims?.publicMetadata?.role as UserRole ?? null;
};
```

### `middleware/role-guard.ts`

```ts
export function requireRole(role: UserRole): preHandlerHookHandler {
  return async (request, reply) => {
    if (request.userRole !== role) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
  };
}
```

### Error Handler (`error-handler.ts`)

- Catch Zod validation errors → `422` with field-level detail.
- Never expose raw PostgreSQL error messages or stack traces in responses.
- Log the full error server-side with `request.log.error(err)`.

### Startup Sequence (`index.ts`)

```
1. Parse config (fail fast if invalid)
2. Run database migrations (runMigrations())
3. Start Scheduler (startScheduler(pool))
4. Build and start Fastify server
5. Log: "FlowForge API listening on port 3000"
```

---

## npm Dependencies

```
fastify
@clerk/fastify
@fastify/cors
fastify-type-provider-zod
pino
zod
```

---

## Response Shape Convention

All API responses must follow this shape:

```ts
// Success
{ "data": T }

// Error
{ "error": { "code": string, "message": string, "details"?: unknown } }
```

This is enforced in every route handler via TypeScript generics:
```ts
FastifyInstance.get<{ Reply: { data: WorkflowDto[] } | ErrorReply }>('/api/workflows', ...)
```

---

## Verification Checklist

- [ ] `GET /health` returns `200 { status: "ok" }` — no auth required.
- [ ] `GET /api/workflows` without Authorization header → `401`.
- [ ] `GET /api/workflows` with invalid JWT → `401`.
- [ ] `GET /api/workflows` with valid Clerk JWT (operator) → `200 { data: [] }`.
- [ ] `POST /api/workflows` with valid Clerk JWT (viewer role) → `403`.
- [ ] Server startup runs migrations and logs each applied migration file.
- [ ] Server startup starts the scheduler and logs "Scheduler started".
- [ ] Missing `CLERK_SECRET_KEY` env var → process exits immediately with a clear error.
- [ ] A thrown error in a route handler returns a sanitized `{ error: ... }` response,
      not a raw stack trace.
- [ ] `tsc --noEmit` exits 0 on `packages/api`.
- [ ] `packages/api` does not import from `packages/worker`.
