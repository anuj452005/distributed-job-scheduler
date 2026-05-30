import type { StepHandler } from '@flowforge/shared';
import { sqlQuerySchema } from '../schemas/sql-query.schema.js';

export const sqlQueryHandler: StepHandler = async (ctx, input) => {
  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested before executing SQL query');
  }

  // Parse input
  const parsed = sqlQuerySchema.parse(input);

  // TODO(unit-22): resolve connectionRef
  ctx.logger.info(
    { connectionRef: parsed.connectionRef, query: parsed.query, paramCount: parsed.params.length },
    `[sql-query] Executing SQL query against connection reference "${parsed.connectionRef}"`
  );

  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested after executing SQL query');
  }

  return {
    rows: [],
    rowCount: 0,
  };
};
