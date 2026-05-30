import { z } from 'zod';

export const sendEmailSchema = z.object({
  connectionRef: z.string(),
  to: z.array(z.string().email()).min(1),
  subject: z.string(),
  body: z.string(),
  html: z.string().optional(),
});

export type SendEmailInput = z.infer<typeof sendEmailSchema>;
