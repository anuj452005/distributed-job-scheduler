import { z } from 'zod';

export const httpRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  timeoutMs: z.number().int().min(100).max(30_000).optional().default(10_000),
  throwOnError: z.boolean().optional().default(true),
});

export type HttpRequestInput = z.infer<typeof httpRequestSchema>;
