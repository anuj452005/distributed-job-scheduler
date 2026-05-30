import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'events-redis',
});

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Check if we should fall back to in-memory mock Redis (e.g. if the REDIS_URL is a placeholder/unset)
const isPlaceholder = REDIS_URL.includes('<name>') || REDIS_URL.includes('<accesskey>') || !process.env.REDIS_URL;
const useMock = process.env.NODE_ENV === 'test' || isPlaceholder;

let publisherClient: any;
let subscriberClient: any;

if (useMock) {
  logger.info('Using in-memory mock Redis for events package');
  // @ts-ignore
  const RedisMock: any = ((await import('ioredis-mock')) as any).default;
  publisherClient = new RedisMock();
  subscriberClient = new RedisMock();
} else {
  publisherClient = new (Redis as any)(REDIS_URL, { lazyConnect: true });
  subscriberClient = new (Redis as any)(REDIS_URL, { lazyConnect: true });
}

export const publisher = publisherClient;
export const subscriber = subscriberClient;

publisher.on('error', (err: any) => {
  logger.error({ err }, 'Redis publisher error');
});

subscriber.on('error', (err: any) => {
  logger.error({ err }, 'Redis subscriber error');
});
