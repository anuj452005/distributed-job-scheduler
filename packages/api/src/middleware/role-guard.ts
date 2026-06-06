import type { preHandlerHookHandler } from 'fastify';
import type { UserRole } from '@flowforge/shared';

export function requireRole(allowedRole: UserRole): preHandlerHookHandler {
  return async (request, reply) => {
    // Hierarchy: 'operator' has all permissions of 'viewer'
    const hasPermission =
      request.userRole === allowedRole ||
      (allowedRole === 'viewer' && request.userRole === 'operator');

    if (!hasPermission) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
    }
  };
}
