import { z } from 'zod';

export const repoIndexerSchema = z.object({
  repoUrl:   z.string().url(),
  branch:    z.string().default('main'),
  outputDir: z.string().optional(),
});

export type RepoIndexerInput = z.infer<typeof repoIndexerSchema>;
