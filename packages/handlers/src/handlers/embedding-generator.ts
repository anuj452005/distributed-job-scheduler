import type { StepHandler } from '@flowforge/shared';
import { embeddingGeneratorSchema } from '../schemas/embedding-generator.schema.js';

export const embeddingGeneratorHandler: StepHandler = async (ctx, input) => {
  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested before executing embedding-generator');
  }

  // Parse input
  const parsed = embeddingGeneratorSchema.parse(input);

  // TODO(unit-22): resolve connectionRef
  ctx.logger.info(
    { connectionRef: parsed.connectionRef, model: parsed.model },
    `[embedding-generator] Generating embeddings using connection reference "${parsed.connectionRef}" (model: "${parsed.model}")`
  );

  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested after executing embedding-generator');
  }

  return {
    embedding: [],
    dimensions: 0,
  };
};
