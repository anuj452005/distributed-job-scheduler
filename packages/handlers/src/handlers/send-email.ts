import type { StepHandler } from '@flowforge/shared';
import { sendEmailSchema } from '../schemas/send-email.schema.js';
import { Resend } from 'resend';

export const sendEmailHandler: StepHandler = async (ctx, input) => {
  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested before executing send-email');
  }

  // Parse input
  const parsed = sendEmailSchema.parse(input);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_xxxxxxxxx') {
    throw new Error('RESEND_API_KEY is not configured or still has the placeholder value in the .env file');
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  ctx.logger.info(
    { to: parsed.to, subject: parsed.subject, connectionRef: parsed.connectionRef, from: fromEmail },
    `[send-email] Sending email to ${parsed.to.join(', ')} with subject "${parsed.subject}" via Resend`
  );

  const resend = new Resend(apiKey);

  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested before sending email payload to Resend');
  }

  const result = await resend.emails.send({
    from: fromEmail,
    to: parsed.to,
    subject: parsed.subject,
    text: parsed.body,
    html: parsed.html || `<p>${parsed.body}</p>`,
  });

  if (result.error) {
    ctx.logger.error({ error: result.error }, `[send-email] Resend API encountered an error`);
    throw new Error(`Resend email delivery failed: ${result.error.message}`);
  }

  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested after email delivery completed');
  }

  return {
    sent: true,
    to: parsed.to,
    subject: parsed.subject,
    id: result.data?.id,
  };
};
