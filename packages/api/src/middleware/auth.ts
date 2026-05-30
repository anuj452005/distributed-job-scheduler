import type { preHandlerHookHandler } from 'fastify';
import { getAuth } from '@clerk/fastify';
import type { UserRole } from '@flowforge/shared';

declare module 'fastify' {
  interface FastifyRequest {
    userRole: UserRole | null;
  }
}

export const requireAuth: preHandlerHookHandler = async (request, reply) => {
  if (process.env.NODE_ENV === 'test') {
    // In test environment, allow mock auth bypassing remote Clerk JWKS calls
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    if (authHeader === 'Bearer invalid') {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    }
    // Set role based on header or default to operator
    const mockRole = (request.headers['x-mock-role'] as UserRole) ?? 'operator';
    request.userRole = mockRole;
    return;
  }

  const auth = getAuth(request);
  if (!auth || !auth.userId) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }

  // Attach role from publicMetadata
  const publicMetadata = auth.sessionClaims?.publicMetadata as { role?: string } | undefined;
  const role = (publicMetadata?.role as UserRole) ?? null;
  request.userRole = role;
};
