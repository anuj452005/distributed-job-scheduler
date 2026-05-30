import { z } from 'zod';

export const blobToPostgresSchema = z.object({
  sourceConnectionRef: z.string(),
  targetConnectionRef: z.string(),
  blobPath:            z.string(),
  targetTable:         z.string(),
  columnMapping:       z.record(z.string()),
  batchSize:           z.number().int().min(1).max(10_000).default(500),
});

export type BlobToPostgresInput = z.infer<typeof blobToPostgresSchema>;
