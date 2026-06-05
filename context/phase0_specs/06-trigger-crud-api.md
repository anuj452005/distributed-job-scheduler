# Unit 06 — Trigger CRUD API & State Machine

> **Phase**: Phase 0 — Trigger Subsystem  
> **System Boundary**: `packages/api/` (new Fastify route plugin, operator-auth required)  
> **Depends On**: Unit 01 (trigger schema), Unit 02 (`@flowforge/trigger`), Unit 11 Phase 0 (API auth foundation)

---

## What This Unit Builds

A full REST CRUD surface for managing workflow triggers, plus the state machine transition endpoints (`ACTIVE` ↔ `PAUSED`, `DISABLED`).

**Visible result**: From the CLI or dashboard, an operator can create, list, get, update, pause, resume, and disable triggers.

---

## Route Map

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/workflows/:workflowId/triggers` | operator | Create a new trigger |
| `GET` | `/api/workflows/:workflowId/triggers` | viewer | List all triggers for a workflow |
| `GET` | `/api/triggers/:triggerId` | viewer | Get a single trigger with last 10 execution logs |
| `PUT` | `/api/triggers/:triggerId` | operator | Update trigger name, config, or misfire policy |
| `POST` | `/api/triggers/:triggerId/pause` | operator | Transition status: `ACTIVE → PAUSED` |
| `POST` | `/api/triggers/:triggerId/resume` | operator | Transition status: `PAUSED → ACTIVE` |
| `POST` | `/api/triggers/:triggerId/disable` | operator | Transition status: any → `DISABLED` |
| `DELETE` | `/api/triggers/:triggerId` | operator | Hard delete (only if DISABLED) |

---

## Files To Create

### [NEW] `packages/api/src/routes/triggers/trigger-routes.ts`

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { db } from '@flowforge/db';
import { requireRole } from '../../middleware/require-role.js';
import {
  createTriggerSchema,
  updateTriggerSchema,
  validateCronExpression,
  generateWebhookToken,
} from './trigger-service.js';

export const triggerRoutes: FastifyPluginAsync = async (fastify) => {

  // ── CREATE ───────────────────────────────────────────────────────────────
  fastify.post<{ Params: { workflowId: string }; Body: CreateTriggerBody }>(
    '/workflows/:workflowId/triggers',
    { preHandler: [requireRole('operator')] },
    async (request, reply) => {
      const { workflowId } = request.params;
      const body = createTriggerSchema.parse(request.body);

      // Validate workflow exists
      const wf = await db.query('SELECT id FROM workflows WHERE id = $1', [workflowId]);
      if (!wf.rows[0]) return reply.status(404).send({ error: 'WORKFLOW_NOT_FOUND' });

      // Build config per trigger type
      let config: Record<string, unknown>;
      if (body.type === 'cron') {
        if (!validateCronExpression(body.config.cron)) {
          return reply.status(422).send({ error: 'INVALID_CRON', field: 'config.cron' });
        }
        config = {
          cron: body.config.cron,
          misfire_policy: body.config.misfire_policy ?? 'SKIP',
        };
      } else if (body.type === 'webhook') {
        config = {
          webhook_token: generateWebhookToken(),
          secret: body.config.secret ?? null,
        };
      } else {
        config = { event_type: body.config.event_type };
      }

      // Compute initial next_fire_at for cron triggers
      const nextFireAt = body.type === 'cron'
        ? computeNextFireAt(body.config.cron)
        : null;

      const res = await db.query<{ id: string }>(
        `INSERT INTO workflow_triggers
           (workflow_id, name, type, status, config, next_fire_at, created_by, updated_by)
         VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, $6)
         RETURNING id`,
        [workflowId, body.name, body.type, JSON.stringify(config), nextFireAt, request.userId]
      );

      return reply.status(201).send({ id: res.rows[0].id });
    }
  );

  // ── LIST ─────────────────────────────────────────────────────────────────
  fastify.get<{ Params: { workflowId: string } }>(
    '/workflows/:workflowId/triggers',
    { preHandler: [requireRole('viewer')] },
    async (request, reply) => {
      const res = await db.query(
        `SELECT id, name, type, status, config, next_fire_at, last_fired_at, created_at
         FROM workflow_triggers
         WHERE workflow_id = $1
         ORDER BY created_at ASC`,
        [request.params.workflowId]
      );
      return reply.send({ triggers: res.rows });
    }
  );

  // ── GET SINGLE (with recent execution history) ───────────────────────────
  fastify.get<{ Params: { triggerId: string } }>(
    '/triggers/:triggerId',
    { preHandler: [requireRole('viewer')] },
    async (request, reply) => {
      const triggerRes = await db.query(
        `SELECT id, workflow_id, name, type, status, config, next_fire_at, last_fired_at, created_at, updated_at
         FROM workflow_triggers
         WHERE id = $1`,
        [request.params.triggerId]
      );
      const trigger = triggerRes.rows[0];
      if (!trigger) return reply.status(404).send({ error: 'TRIGGER_NOT_FOUND' });

      const historyRes = await db.query(
        `SELECT id, status, triggered_at, source_type, idempotency_key, error_message, workflow_run_id
         FROM workflow_trigger_executions
         WHERE trigger_id = $1
         ORDER BY triggered_at DESC
         LIMIT 10`,
        [trigger.id]
      );

      return reply.send({ trigger, recentExecutions: historyRes.rows });
    }
  );

  // ── UPDATE ───────────────────────────────────────────────────────────────
  fastify.put<{ Params: { triggerId: string }; Body: UpdateTriggerBody }>(
    '/triggers/:triggerId',
    { preHandler: [requireRole('operator')] },
    async (request, reply) => {
      const body = updateTriggerSchema.parse(request.body);
      const { triggerId } = request.params;

      // Only name and config fields can be updated (not type or status via PUT)
      const res = await db.query(
        `UPDATE workflow_triggers
         SET name = COALESCE($1, name),
             config = CASE WHEN $2::jsonb IS NOT NULL THEN $2::jsonb ELSE config END,
             updated_by = $3,
             updated_at = NOW()
         WHERE id = $4 AND status != 'DISABLED'
         RETURNING id`,
        [body.name ?? null, body.config ? JSON.stringify(body.config) : null, request.userId, triggerId]
      );

      if (!res.rows[0]) {
        return reply.status(404).send({ error: 'TRIGGER_NOT_FOUND_OR_DISABLED' });
      }
      return reply.send({ updated: true });
    }
  );

  // ── STATE MACHINE TRANSITIONS ────────────────────────────────────────────
  const transitionRoute = (
    fromStatuses: string[],
    toStatus: string,
    errorCode: string
  ) => async (request: any, reply: any) => {
    const res = await db.query(
      `UPDATE workflow_triggers
       SET status = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3 AND status = ANY($4::trigger_status[])
       RETURNING id`,
      [toStatus, request.userId, request.params.triggerId, fromStatuses]
    );
    if (!res.rows[0]) {
      return reply.status(409).send({ error: errorCode });
    }
    return reply.send({ status: toStatus });
  };

  fastify.post('/triggers/:triggerId/pause',
    { preHandler: [requireRole('operator')] },
    transitionRoute(['ACTIVE'], 'PAUSED', 'NOT_ACTIVE')
  );

  fastify.post('/triggers/:triggerId/resume',
    { preHandler: [requireRole('operator')] },
    transitionRoute(['PAUSED'], 'ACTIVE', 'NOT_PAUSED')
  );

  fastify.post('/triggers/:triggerId/disable',
    { preHandler: [requireRole('operator')] },
    transitionRoute(['ACTIVE', 'PAUSED'], 'DISABLED', 'ALREADY_DISABLED')
  );

  // ── DELETE (DISABLED only) ───────────────────────────────────────────────
  fastify.delete<{ Params: { triggerId: string } }>(
    '/triggers/:triggerId',
    { preHandler: [requireRole('operator')] },
    async (request, reply) => {
      const res = await db.query(
        `DELETE FROM workflow_triggers
         WHERE id = $1 AND status = 'DISABLED'
         RETURNING id`,
        [request.params.triggerId]
      );
      if (!res.rows[0]) {
        return reply.status(409).send({
          error: 'CANNOT_DELETE',
          message: 'Trigger must be DISABLED before deletion. Use POST /triggers/:id/disable first.',
        });
      }
      return reply.status(204).send();
    }
  );
};
```

### [NEW] `packages/api/src/routes/triggers/trigger-service.ts`

```typescript
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import parser from 'cron-parser';

export const createTriggerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cron'),
    name: z.string().min(1).max(255),
    config: z.object({
      cron: z.string(),
      misfire_policy: z.enum(['SKIP', 'RUN_ONCE', 'CATCH_UP']).optional(),
    }),
  }),
  z.object({
    type: z.literal('webhook'),
    name: z.string().min(1).max(255),
    config: z.object({
      secret: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('event'),
    name: z.string().min(1).max(255),
    config: z.object({
      event_type: z.string().min(1),
    }),
  }),
]);

export const updateTriggerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.unknown()).optional(),
});

export type CreateTriggerBody = z.infer<typeof createTriggerSchema>;
export type UpdateTriggerBody = z.infer<typeof updateTriggerSchema>;

export function validateCronExpression(expr: string): boolean {
  try {
    parser.parseExpression(expr);
    return true;
  } catch {
    return false;
  }
}

export function generateWebhookToken(): string {
  return randomUUID(); // cryptographically random, URL-safe
}

export function computeNextFireAt(cronExpr: string): Date {
  return parser.parseExpression(cronExpr).next().toDate();
}
```

### [MODIFY] `packages/api/src/server.ts`

```typescript
import { triggerRoutes } from './routes/triggers/trigger-routes.js';

// Inside buildServer():
await fastify.register(triggerRoutes, { prefix: '/api' });
```

---

## State Machine

```
              ┌─────────┐
        ┌────►│  ACTIVE │◄────┐
        │     └────┬────┘     │
    resume        │pause    resume
        │          ▼          │
        │     ┌─────────┐     │
        └─────│  PAUSED │─────┘
              └────┬────┘
                   │ disable
                   ▼
              ┌──────────┐
              │ DISABLED │  (terminal for most operations)
              └──────────┘
```

- `ACTIVE → PAUSED`: Cron tick skips the trigger. Webhook/event returns `409 WEBHOOK_INACTIVE`.
- `PAUSED → ACTIVE`: Resumes normal operation. Cron computes a fresh `next_fire_at`.
- `ACTIVE/PAUSED → DISABLED`: Permanent stop. Trigger cannot be re-enabled (by design for audit trail).
- `DISABLED`: Can only be deleted.

---

## Verification Checklist

- [ ] `tsc --noEmit` from `packages/api/` exits 0
- [ ] `POST /api/workflows/:id/triggers` (cron, invalid cron expression) → `422 INVALID_CRON`
- [ ] `POST /api/workflows/:id/triggers` (cron, valid) → `201` with `id`
- [ ] `GET /api/workflows/:id/triggers` → list includes the created trigger
- [ ] `GET /api/triggers/:id` → returns trigger + empty `recentExecutions`
- [ ] `POST /api/triggers/:id/pause` → status becomes `PAUSED`
- [ ] `POST /api/triggers/:id/pause` again → `409 NOT_ACTIVE`
- [ ] `POST /api/triggers/:id/resume` → status becomes `ACTIVE`
- [ ] `POST /api/triggers/:id/disable` → status becomes `DISABLED`
- [ ] `POST /api/triggers/:id/pause` on DISABLED → `409 NOT_ACTIVE`
- [ ] `DELETE /api/triggers/:id` on ACTIVE → `409 CANNOT_DELETE`
- [ ] `DELETE /api/triggers/:id` on DISABLED → `204`
- [ ] `PUT /api/triggers/:id` updates `name` correctly
- [ ] viewer role can GET but not POST/PUT/DELETE (403 on mutations)
- [ ] Integration tests added covering all routes
