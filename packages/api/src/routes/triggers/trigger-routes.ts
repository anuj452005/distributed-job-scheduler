import type { FastifyPluginAsync } from 'fastify';
import { pool } from '@flowforge/db';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role-guard.js';
import {
  createTriggerSchema,
  updateTriggerSchema,
  validateCronExpression,
  generateWebhookToken,
  computeNextFireAt,
  cronConfigSchema,
  webhookConfigSchema,
  eventConfigSchema,
  type CreateTriggerBody,
  type UpdateTriggerBody,
} from './trigger-service.js';

export const triggerRoutes: FastifyPluginAsync = async (fastify) => {

  // ── CREATE ───────────────────────────────────────────────────────────────
  fastify.post<{ Params: { workflowId: string }; Body: CreateTriggerBody }>(
    '/workflows/:workflowId/triggers',
    { preHandler: [requireAuth, requireRole('operator')] },
    async (request, reply) => {
      const { workflowId } = request.params;
      const body = createTriggerSchema.parse(request.body);

      // Validate workflow exists
      const wf = await pool.query('SELECT id FROM workflows WHERE id = $1', [workflowId]);
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
        config = {
          event_type: body.config.event_type,
        };
      }

      // Compute initial next_fire_at for cron triggers
      const nextFireAt = body.type === 'cron'
        ? computeNextFireAt(body.config.cron)
        : null;

      const res = await pool.query<{ id: string }>(
        `INSERT INTO workflow_triggers
           (workflow_id, name, type, status, config, next_fire_at, created_by, updated_by)
         VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, $6)
         RETURNING id`,
        [workflowId, body.name, body.type, JSON.stringify(config), nextFireAt, request.userId]
      );

      const triggerId = res.rows[0].id;

      // Insert audit log
      await pool.query(
        `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
         VALUES ($1, 'trigger.create', $2, $3)`,
        [
          request.userId,
          triggerId,
          JSON.stringify({
            workflowId,
            name: body.name,
            type: body.type,
          }),
        ]
      );

      return reply.status(201).send({ data: { id: triggerId } });
    }
  );

  // ── LIST ─────────────────────────────────────────────────────────────────
  fastify.get<{ Params: { workflowId: string } }>(
    '/workflows/:workflowId/triggers',
    { preHandler: [requireAuth, requireRole('viewer')] },
    async (request, reply) => {
      const res = await pool.query(
        `SELECT id, name, type, status, config, next_fire_at, last_fired_at, created_at
         FROM workflow_triggers
         WHERE workflow_id = $1
         ORDER BY created_at ASC`,
        [request.params.workflowId]
      );
      return reply.send({ data: { triggers: res.rows } });
    }
  );

  // ── GET SINGLE (with recent execution history) ───────────────────────────
  fastify.get<{ Params: { triggerId: string } }>(
    '/triggers/:triggerId',
    { preHandler: [requireAuth, requireRole('viewer')] },
    async (request, reply) => {
      const triggerRes = await pool.query(
        `SELECT id, workflow_id, name, type, status, config, next_fire_at, last_fired_at, created_at, updated_at
         FROM workflow_triggers
         WHERE id = $1`,
        [request.params.triggerId]
      );
      const trigger = triggerRes.rows[0];
      if (!trigger) return reply.status(404).send({ error: 'TRIGGER_NOT_FOUND' });

      const historyRes = await pool.query(
         `SELECT id, status, triggered_at, source_type, idempotency_key, error_message, workflow_run_id
          FROM workflow_trigger_executions
          WHERE trigger_id = $1
          ORDER BY triggered_at DESC
          LIMIT 10`,
        [trigger.id]
      );

      return reply.send({ data: { trigger, recentExecutions: historyRes.rows } });
    }
  );

  // ── UPDATE ───────────────────────────────────────────────────────────────
  fastify.put<{ Params: { triggerId: string }; Body: UpdateTriggerBody }>(
    '/triggers/:triggerId',
    { preHandler: [requireAuth, requireRole('operator')] },
    async (request, reply) => {
      const body = updateTriggerSchema.parse(request.body);
      const { triggerId } = request.params;

      // Fetch current trigger to perform merging and validation
      const currentRes = await pool.query(
        `SELECT type, name, config, status FROM workflow_triggers WHERE id = $1`,
        [triggerId]
      );
      const current = currentRes.rows[0];
      if (!current || current.status === 'DISABLED') {
        return reply.status(404).send({ error: 'TRIGGER_NOT_FOUND_OR_DISABLED' });
      }

      const userId = request.userId;
      const updateFields: string[] = [];
      const queryParams: any[] = [];

      // Always update updated_at and updated_by
      updateFields.push(`updated_at = NOW()`);
      updateFields.push(`updated_by = $${queryParams.length + 1}`);
      queryParams.push(userId);

      // Add name if provided, or keep current
      updateFields.push(`name = $${queryParams.length + 1}`);
      queryParams.push(body.name ?? current.name);

      let newConfig = current.config;
      if (body.config) {
        // Merge configuration
        const merged = { ...current.config, ...body.config };

        // Validate merged config based on trigger type
        if (current.type === 'cron') {
          const parsedConfig = cronConfigSchema.parse(merged);
          if (!validateCronExpression(parsedConfig.cron)) {
            return reply.status(422).send({ error: 'INVALID_CRON', field: 'config.cron' });
          }
          newConfig = parsedConfig;

          // Recalculate next_fire_at if the cron expression changed
          if (current.config.cron !== parsedConfig.cron) {
            const newNextFireAt = computeNextFireAt(parsedConfig.cron);
            updateFields.push(`next_fire_at = $${queryParams.length + 1}`);
            queryParams.push(newNextFireAt);
          }
        } else if (current.type === 'webhook') {
          // Ensure webhook_token is preserved and cannot be overwritten
          const mergedWebhook = {
            ...merged,
            webhook_token: current.config.webhook_token,
          };
          newConfig = webhookConfigSchema.parse(mergedWebhook);
        } else if (current.type === 'event') {
          newConfig = eventConfigSchema.parse(merged);
        }
      }

      updateFields.push(`config = $${queryParams.length + 1}`);
      queryParams.push(JSON.stringify(newConfig));

      // Append triggerId for WHERE clause
      queryParams.push(triggerId);
      const triggerIdPlaceholder = `$${queryParams.length}`;

      const queryStr = `
        UPDATE workflow_triggers
        SET ${updateFields.join(', ')}
        WHERE id = ${triggerIdPlaceholder} AND status != 'DISABLED'
        RETURNING id
      `;

      const res = await pool.query(queryStr, queryParams);

      if (!res.rows[0]) {
        return reply.status(404).send({ error: 'TRIGGER_NOT_FOUND_OR_DISABLED' });
      }

      // Insert audit log
      await pool.query(
        `INSERT INTO audit_logs (actor_id, action, resource_id, metadata)
         VALUES ($1, 'trigger.update', $2, $3)`,
        [
          userId,
          triggerId,
          JSON.stringify({
            name: body.name,
            configUpdated: !!body.config,
          }),
        ]
      );

      return reply.send({ data: { updated: true } });
    }
  );

  // ── STATE MACHINE TRANSITIONS ────────────────────────────────────────────

  // PAUSE: ACTIVE -> PAUSED
  fastify.post<{ Params: { triggerId: string } }>(
    '/triggers/:triggerId/pause',
    { preHandler: [requireAuth, requireRole('operator')] },
    async (request, reply) => {
      const { triggerId } = request.params;
      const res = await pool.query(
        `UPDATE workflow_triggers
         SET status = 'PAUSED',
             next_fire_at = NULL,
             updated_by = $1,
             updated_at = NOW()
         WHERE id = $2 AND status = 'ACTIVE'
         RETURNING id`,
        [request.userId, triggerId]
      );
      if (!res.rows[0]) {
        return reply.status(409).send({ error: 'NOT_ACTIVE' });
      }

      await pool.query(
        `INSERT INTO audit_logs (actor_id, action, resource_id)
         VALUES ($1, 'trigger.pause', $2)`,
        [request.userId, triggerId]
      );

      return reply.send({ data: { status: 'PAUSED' } });
    }
  );

  // RESUME: PAUSED -> ACTIVE
  fastify.post<{ Params: { triggerId: string } }>(
    '/triggers/:triggerId/resume',
    { preHandler: [requireAuth, requireRole('operator')] },
    async (request, reply) => {
      const { triggerId } = request.params;

      const triggerRes = await pool.query(
        `SELECT type, config FROM workflow_triggers WHERE id = $1 AND status = 'PAUSED'`,
        [triggerId]
      );
      const trigger = triggerRes.rows[0];
      if (!trigger) {
        return reply.status(409).send({ error: 'NOT_PAUSED' });
      }

      let nextFireAt: Date | null = null;
      if (trigger.type === 'cron') {
        nextFireAt = computeNextFireAt(trigger.config.cron);
      }

      const res = await pool.query(
        `UPDATE workflow_triggers
         SET status = 'ACTIVE',
             next_fire_at = $1,
             updated_by = $2,
             updated_at = NOW()
         WHERE id = $3 AND status = 'PAUSED'
         RETURNING id`,
        [nextFireAt, request.userId, triggerId]
      );
      if (!res.rows[0]) {
        return reply.status(409).send({ error: 'NOT_PAUSED' });
      }

      await pool.query(
        `INSERT INTO audit_logs (actor_id, action, resource_id)
         VALUES ($1, 'trigger.resume', $2)`,
        [request.userId, triggerId]
      );

      return reply.send({ data: { status: 'ACTIVE' } });
    }
  );

  // DISABLE: ACTIVE/PAUSED -> DISABLED
  fastify.post<{ Params: { triggerId: string } }>(
    '/triggers/:triggerId/disable',
    { preHandler: [requireAuth, requireRole('operator')] },
    async (request, reply) => {
      const { triggerId } = request.params;
      const res = await pool.query(
        `UPDATE workflow_triggers
         SET status = 'DISABLED',
             next_fire_at = NULL,
             updated_by = $1,
             updated_at = NOW()
         WHERE id = $2 AND status IN ('ACTIVE', 'PAUSED')
         RETURNING id`,
        [request.userId, triggerId]
      );
      if (!res.rows[0]) {
        return reply.status(409).send({ error: 'ALREADY_DISABLED' });
      }

      await pool.query(
        `INSERT INTO audit_logs (actor_id, action, resource_id)
         VALUES ($1, 'trigger.disable', $2)`,
        [request.userId, triggerId]
      );

      return reply.send({ data: { status: 'DISABLED' } });
    }
  );

  // ── ROTATE WEBHOOK TOKEN (ACTIVE/PAUSED only) ─────────────────────────────
  fastify.post<{ Params: { triggerId: string } }>(
    '/triggers/:triggerId/rotate',
    { preHandler: [requireAuth, requireRole('operator')] },
    async (request, reply) => {
      const { triggerId } = request.params;

      const triggerRes = await pool.query(
        `SELECT type, config, status FROM workflow_triggers WHERE id = $1`,
        [triggerId]
      );
      const trigger = triggerRes.rows[0];
      if (!trigger) {
        return reply.status(404).send({ error: 'TRIGGER_NOT_FOUND' });
      }

      if (trigger.type !== 'webhook') {
        return reply.status(422).send({
          error: 'INVALID_TRIGGER_TYPE',
          message: 'Only webhook triggers can have their tokens rotated.',
        });
      }

      if (trigger.status === 'DISABLED') {
        return reply.status(409).send({
          error: 'TRIGGER_DISABLED',
          message: 'Cannot rotate tokens on disabled triggers.',
        });
      }

      const newToken = generateWebhookToken();
      const newConfig = {
        ...trigger.config,
        webhook_token: newToken,
      };

      await pool.query(
        `UPDATE workflow_triggers
         SET config = $1,
             updated_by = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(newConfig), request.userId, triggerId]
      );

      await pool.query(
        `INSERT INTO audit_logs (actor_id, action, resource_id)
         VALUES ($1, 'trigger.rotate', $2)`,
        [request.userId, triggerId]
      );

      return reply.send({ data: { webhook_token: newToken } });
    }
  );

  // ── DELETE (DISABLED only) ───────────────────────────────────────────────
  fastify.delete<{ Params: { triggerId: string } }>(
    '/triggers/:triggerId',
    { preHandler: [requireAuth, requireRole('operator')] },
    async (request, reply) => {
      const { triggerId } = request.params;

      const triggerRes = await pool.query(
        `SELECT status FROM workflow_triggers WHERE id = $1`,
        [triggerId]
      );
      if (triggerRes.rows.length === 0) {
        return reply.status(404).send({ error: 'TRIGGER_NOT_FOUND' });
      }

      if (triggerRes.rows[0].status !== 'DISABLED') {
        return reply.status(409).send({
          error: 'CANNOT_DELETE',
          message: 'Trigger must be DISABLED before deletion. Use POST /triggers/:id/disable first.',
        });
      }

      await pool.query(
        `DELETE FROM workflow_triggers
         WHERE id = $1 AND status = 'DISABLED'`,
        [triggerId]
      );

      await pool.query(
        `INSERT INTO audit_logs (actor_id, action, resource_id)
         VALUES ($1, 'trigger.delete', $2)`,
        [request.userId, triggerId]
      );

      return reply.status(204).send();
    }
  );
};
