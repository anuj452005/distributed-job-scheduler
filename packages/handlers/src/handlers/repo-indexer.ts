import type { StepHandler } from '@flowforge/shared';
import { repoIndexerSchema } from '../schemas/repo-indexer.schema.js';

export const repoIndexerHandler: StepHandler = async (ctx, input) => {
  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested before executing repo-indexer');
  }

  // Parse input
  const parsed = repoIndexerSchema.parse(input);

  ctx.logger.info(
    { repoUrl: parsed.repoUrl, branch: parsed.branch, outputDir: parsed.outputDir },
    `[repo-indexer] Executing repository indexing for "${parsed.repoUrl}" (branch: "${parsed.branch}")`
  );

  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested after executing repo-indexer');
  }

  return {
    filesIndexed: 0,
  };
};
