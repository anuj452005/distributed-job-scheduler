import type { FastifyPluginAsync } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pool } from '@flowforge/db';
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
      const triggerRes = await pool.query<{
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
      const result = await triggerWorkflow(pool, {
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
