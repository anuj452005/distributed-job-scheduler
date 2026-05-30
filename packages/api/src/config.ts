import { z } from 'zod';

const ConfigSchema = z.object({
  DATABASE_URL:           z.string().url(),
  REDIS_URL:              z.string(),
  CLERK_SECRET_KEY:       z.string().min(1),
  CLERK_PUBLISHABLE_KEY:  z.string().min(1),
  PORT:                   z.coerce.number().default(3000),
  SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  SWEEPER_POLL_INTERVAL_MS:   z.coerce.number().default(15000),
});

export const config = ConfigSchema.parse(process.env);
