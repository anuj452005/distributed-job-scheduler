import type { preHandlerHookHandler } from 'fastify';
import type { UserRole } from '@flowforge/shared';

export function requireRole(allowedRole: UserRole): preHandlerHookHandler {
  return async (request, reply) => {
    // If request.userRole doesn't match the allowedRole, return 403 Forbidden
    if (request.userRole !== allowedRole) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
    }
  };
}
