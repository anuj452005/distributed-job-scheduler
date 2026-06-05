# Unit 04 — Webhook Token Receiver

> **Phase**: Phase 0 — Trigger Subsystem  
> **System Boundary**: `packages/api/` (new Fastify route plugin)  
> **Depends On**: Unit 01 (trigger schema), Unit 02 (`@flowforge/trigger`), Unit 03 (cron scheduler compiles)

---

## What This Unit Builds

A public (no Clerk auth required) Fastify route at `POST /api/webhooks/:token` that:

1. Looks up the webhook trigger by the URL token using the unique partial index.
2. Validates the request HMAC signature using `X-FlowForge-Signature` (SHA-256 HMAC).
3. Extracts the idempotency key from `X-FlowForge-Delivery` header.
4. Calls `triggerWorkflow` with the raw request body as the payload.

**Visible result**: `curl -X POST http://localhost:3000/api/webhooks/<token> -H "X-FlowForge-Signature: sha256=<hmac>"` creates a `workflow_run` and returns `202 Accepted` with the `run_id`.

---

## Files To Create / Modify

### [NEW] `packages/api/src/routes/webhooks/webhook-routes.ts`

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@flowforge/db';
import { triggerWorkflow } from '@flowforge/trigger';

/**
 * Public webhook receiver — no Clerk JWT required.
 * Authentication is performed via HMAC signature validation.
 */
export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { token: string };
  }>(
    '/webhooks/:token',
    {
      config: { skipAuth: true }, // Signal to global auth preHandler to skip
      schema: {
        params: {
          type: 'object',
          properties: { token: { type: 'string' } },
          required: ['token'],
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params;

      // ── 1. Look up trigger by webhook token ──────────────────────────────
      const triggerRes = await db.query<{
        id: string;
        workflow_id: string;
        status: string;
        config: { webhook_token: string; secret?: string };
      }>(
        `SELECT id, workflow_id, status, config
         FROM workflow_triggers
         WHERE type = 'webhook'
           AND config->>'webhook_token' = $1`,
        [token]
      );

      const trigger = triggerRes.rows[0];
      if (!trigger) {
        return reply.status(404).send({ error: 'WEBHOOK_NOT_FOUND' });
      }

      if (trigger.status !== 'ACTIVE') {
        return reply.status(409).send({
          error: 'WEBHOOK_INACTIVE',
          message: `Trigger is ${trigger.status}. Cannot accept deliveries.`,
        });
      }

      // ── 2. HMAC Signature Validation ─────────────────────────────────────
      const secret = trigger.config.secret;
      if (secret) {
        const signature = request.headers['x-flowforge-signature'] as string | undefined;
        if (!signature) {
          return reply.status(401).send({ error: 'MISSING_SIGNATURE' });
        }

        const rawBody = (request as any).rawBody as Buffer | undefined;
        if (!rawBody) {
          return reply
            .status(500)
            .send({ error: 'RAW_BODY_UNAVAILABLE', message: 'Configure rawBody: true in Fastify.' });
        }

        const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
        const sigBuffer = Buffer.from(signature, 'utf-8');
        const expBuffer = Buffer.from(expected, 'utf-8');

        // Use timing-safe comparison to prevent timing oracle attacks
        const valid =
          sigBuffer.length === expBuffer.length &&
          timingSafeEqual(sigBuffer, expBuffer);

        if (!valid) {
          return reply.status(401).send({ error: 'INVALID_SIGNATURE' });
        }
      }

      // ── 3. Extract idempotency key ────────────────────────────────────────
      const deliveryId = request.headers['x-flowforge-delivery'] as string | undefined;

      // ── 4. Fire trigger ───────────────────────────────────────────────────
      const result = await triggerWorkflow(db, {
        triggerId: trigger.id,
        workflowId: trigger.workflow_id,
        payload: request.body as Record<string, unknown>,
        idempotencyKey: deliveryId,
        sourceType: 'webhook',
        userId: 'system:webhook',
      });

      if (result.status === 'DEDUPLICATED') {
        return reply.status(200).send({ status: 'DEDUPLICATED' });
      }

      if (result.status === 'FAILED') {
        return reply.status(500).send({ error: 'TRIGGER_FAILED', message: result.error });
      }

      return reply.status(202).send({ status: 'ACCEPTED', run_id: result.runId });
    }
  );
};
```

### [MODIFY] `packages/api/src/server.ts`

Register the webhook plugin **without** the global `requireAuth` preHandler. Add alongside existing route registrations:

```typescript
import { webhookRoutes } from './routes/webhooks/webhook-routes.js';

// Inside buildServer():
// Register BEFORE routes that use requireAuth preHandler,
// or use fastify.register with no auth preHandler in scope.
await fastify.register(webhookRoutes, { prefix: '/api' });
```

### [MODIFY] `packages/api/src/server.ts` — Enable `rawBody`

For HMAC to work, Fastify must preserve the raw request body buffer:

```typescript
const fastify = Fastify({
  logger: pinoLogger,
  // Required for HMAC webhook signature validation
  // See: https://fastify.dev/docs/latest/Reference/ContentTypeParser/
});

// Add a raw body capture hook
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => {
    (req as any).rawBody = body;
    try {
      done(null, JSON.parse(body.toString()));
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);
```

> **Note**: If the API already uses a custom content-type parser, merge `rawBody` capture into it. Do not register two parsers for the same content type.

---

## Security Model

### HMAC Validation Flow

```
Client request:
  POST /api/webhooks/<token>
  X-FlowForge-Signature: sha256=<hex>
  X-FlowForge-Delivery: <vendor-delivery-id>
  Body: { ...payload... }

Server validation:
  1. Lookup trigger by token (unique index → O(1))
  2. Compute: HMAC-SHA256(secret, rawBodyBuffer).hexDigest()
  3. Prefix with "sha256="
  4. timingSafeEqual(received, computed) → 401 if false
  5. idempotencyKey = X-FlowForge-Delivery header
  6. Call triggerWorkflow → 202 or 200 (DEDUPLICATED)
```

### Why `timingSafeEqual`?

Standard string comparison (`===`) short-circuits on the first differing character, leaking timing information that an attacker can use to brute-force the HMAC byte by byte. `timingSafeEqual` always compares all bytes in constant time.

### Triggers Without a `secret`

If `config.secret` is not set, signature validation is **skipped entirely**. This allows integrations that do not support HMAC (e.g., simple ping webhooks) to work immediately. Operators must consciously configure a secret if they want security — this is surfaced clearly in the dashboard (Unit 05).

### Token Exposure

The webhook token (`config->>'webhook_token'`) is in the URL path. It is treated as a capability — knowing the token grants the ability to fire the trigger. Therefore:
- Tokens must be generated as cryptographically random UUIDs (not sequential IDs).
- Tokens should be rotatable — operator can update `config.webhook_token` via the CRUD API.

---

## HTTP API Contract

### Request

```
POST /api/webhooks/:token
Content-Type: application/json
X-FlowForge-Signature: sha256=<hex>     (required if trigger has a secret)
X-FlowForge-Delivery: <delivery-id>    (optional; enables idempotency)

{ ...arbitrary JSON payload... }
```

### Responses

| Status | Body | Condition |
|---|---|---|
| `202 Accepted` | `{ "status": "ACCEPTED", "run_id": "<uuid>" }` | Trigger fired, new run created |
| `200 OK` | `{ "status": "DEDUPLICATED" }` | Same delivery ID already processed |
| `401 Unauthorized` | `{ "error": "MISSING_SIGNATURE" \| "INVALID_SIGNATURE" }` | Signature absent or wrong |
| `404 Not Found` | `{ "error": "WEBHOOK_NOT_FOUND" }` | No trigger with this token |
| `409 Conflict` | `{ "error": "WEBHOOK_INACTIVE" }` | Trigger is PAUSED or DISABLED |
| `500 Internal Server Error` | `{ "error": "TRIGGER_FAILED", "message": "..." }` | Engine threw during run creation |

---

## Verification Checklist

- [ ] `tsc --noEmit` from `packages/api/` exits 0
- [ ] `POST /api/webhooks/nonexistent-token` returns `404`
- [ ] Insert an ACTIVE webhook trigger with `config = { "webhook_token": "abc123" }` (no secret)
- [ ] `POST /api/webhooks/abc123` with JSON body returns `202` and a valid `run_id`
- [ ] Repeat the same request with `X-FlowForge-Delivery: delivery-1` → `202`
- [ ] Repeat again with same `X-FlowForge-Delivery: delivery-1` → `200 DEDUPLICATED`
- [ ] Add a `secret` to the trigger config. `POST` without signature → `401 MISSING_SIGNATURE`
- [ ] `POST` with wrong signature → `401 INVALID_SIGNATURE`
- [ ] `POST` with correct HMAC-SHA256 signature → `202`
- [ ] Set trigger `status = 'PAUSED'` → `POST` returns `409 WEBHOOK_INACTIVE`
- [ ] Integration test added to `packages/api/src/index.test.ts` or a dedicated `webhook.test.ts`
