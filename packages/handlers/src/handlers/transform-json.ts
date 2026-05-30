import type { StepHandler } from '@flowforge/shared';
import jsonata from 'jsonata';
import { transformJsonSchema } from '../schemas/transform-json.schema.js';

export const transformJsonHandler: StepHandler = async (ctx, input) => {
  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested before executing transform-json');
  }

  // Parse input
  const parsed = transformJsonSchema.parse(input);

  ctx.logger.info({ expression: parsed.expression }, `[transform-json] Evaluating JSONata expression`);

  const expression = jsonata(parsed.expression);

  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested during JSONata transformation');
  }

  const result = await expression.evaluate(parsed.input);

  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested after JSONata transformation');
  }

  return result;
};
