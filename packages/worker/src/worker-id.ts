import { randomUUID } from 'crypto';
import * as os from 'os';

export function generateWorkerId(): string {
  return `worker-${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
}
