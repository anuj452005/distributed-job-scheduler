import type { StepHandler } from '@flowforge/shared';
import { sendEmailSchema } from '../schemas/send-email.schema.js';

export const sendEmailHandler: StepHandler = async (ctx, input) => {
  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested before executing send-email');
  }

  // Parse input
  const parsed = sendEmailSchema.parse(input);

  // TODO(unit-22): resolve connectionRef
  ctx.logger.info(
    { to: parsed.to, subject: parsed.subject, connectionRef: parsed.connectionRef },
    `[send-email] Sending email to ${parsed.to.join(', ')} with subject "${parsed.subject}" (using connection reference: "${parsed.connectionRef}")`
  );

  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested after sending email');
  }

  return {
    sent: true,
    to: parsed.to,
    subject: parsed.subject,
  };
};
