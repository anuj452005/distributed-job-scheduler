import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';

export const cronConfigSchema = z.object({
  cron: z.string(),
  misfire_policy: z.enum(['SKIP', 'RUN_ONCE', 'CATCH_UP']).optional(),
});

export const webhookConfigSchema = z.object({
  webhook_token: z.string(),
  secret: z.string().nullable().optional(),
});

export const eventConfigSchema = z.object({
  event_type: z.string().min(1),
});

export const createTriggerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cron'),
    name: z.string().min(1).max(255),
    config: cronConfigSchema,
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
    config: eventConfigSchema,
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
    CronExpressionParser.parse(expr);
    return true;
  } catch {
    return false;
  }
}

export function generateWebhookToken(): string {
  return randomUUID(); // cryptographically random, URL-safe
}

export function computeNextFireAt(cronExpr: string): Date {
  return CronExpressionParser.parse(cronExpr).next().toDate();
}
