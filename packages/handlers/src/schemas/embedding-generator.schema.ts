import { z } from 'zod';

export const embeddingGeneratorSchema = z.object({
  connectionRef: z.string(),
  text:          z.string().min(1),
  model:         z.string().default('text-embedding-ada-002'),
});

export type EmbeddingGeneratorInput = z.infer<typeof embeddingGeneratorSchema>;
