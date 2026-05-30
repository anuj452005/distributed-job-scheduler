import { z } from 'zod';

export const sqlQuerySchema = z.object({
  connectionRef: z.string(),
  query: z.string(),
  params: z.array(z.unknown()).optional().default([]),
});

export type SqlQueryInput = z.infer<typeof sqlQuerySchema>;
