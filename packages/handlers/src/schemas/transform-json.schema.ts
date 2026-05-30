import { z } from 'zod';

export const transformJsonSchema = z.object({
  expression: z.string(),
  input:      z.record(z.unknown()),
});

export type TransformJsonInput = z.infer<typeof transformJsonSchema>;
