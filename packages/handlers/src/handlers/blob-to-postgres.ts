import type { StepHandler } from '@flowforge/shared';
import { blobToPostgresSchema } from '../schemas/blob-to-postgres.schema.js';

export const blobToPostgresHandler: StepHandler = async (ctx, input) => {
  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested before executing blob-to-postgres');
  }

  // Parse input
  const parsed = blobToPostgresSchema.parse(input);

  // TODO(unit-22): resolve connectionRefs
  ctx.logger.info(
    {
      sourceConnectionRef: parsed.sourceConnectionRef,
      targetConnectionRef: parsed.targetConnectionRef,
      blobPath: parsed.blobPath,
      targetTable: parsed.targetTable,
      batchSize: parsed.batchSize,
    },
    `[blob-to-postgres] Starting BLOB data transfer from "${parsed.blobPath}" (source: "${parsed.sourceConnectionRef}") to table "${parsed.targetTable}" (target: "${parsed.targetConnectionRef}")`
  );

  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested after executing blob-to-postgres');
  }

  return {
    rowsProcessed: 0,
  };
};
