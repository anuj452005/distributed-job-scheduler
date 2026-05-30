import { handlerRegistry } from './registry.js';
import { httpRequestHandler } from './handlers/http-request.js';
import { sendEmailHandler } from './handlers/send-email.js';
import { sqlQueryHandler } from './handlers/sql-query.js';
import { blobToPostgresHandler } from './handlers/blob-to-postgres.js';
import { transformJsonHandler } from './handlers/transform-json.js';
import { repoIndexerHandler } from './handlers/repo-indexer.js';
import { embeddingGeneratorHandler } from './handlers/embedding-generator.js';

export function registerAllHandlers(): void {
  handlerRegistry.register('http-request',        httpRequestHandler);
  handlerRegistry.register('send-email',          sendEmailHandler);
  handlerRegistry.register('sql-query',           sqlQueryHandler);
  handlerRegistry.register('blob-to-postgres',    blobToPostgresHandler);
  handlerRegistry.register('transform-json',      transformJsonHandler);
  handlerRegistry.register('repo-indexer',        repoIndexerHandler);
  handlerRegistry.register('embedding-generator', embeddingGeneratorHandler);
}

export { handlerRegistry };
