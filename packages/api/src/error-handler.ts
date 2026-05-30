import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

export const errorHandler = (err: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  // Log the full error on the server side
  request.log.error(err);

  // 1. Check if it's a Zod schema validation error
  if (err instanceof ZodError) {
    return reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      }
    });
  }

  // 2. Check if Fastify has parsed it as a schema validation error (e.g. from fastify-type-provider-zod)
  if ('validation' in err) {
    return reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.validation
      }
    });
  }

  // 3. Fallback for all other errors: sanitize database/internal details
  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500 ? 'An unexpected error occurred' : err.message;
  const code = statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';

  return reply.status(statusCode).send({
    error: {
      code,
      message
    }
  });
};
