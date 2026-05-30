import type { preHandlerHookHandler } from 'fastify';
import { getAuth } from '@clerk/fastify';
import type { UserRole } from '@flowforge/shared';

declare module 'fastify' {
  interface FastifyRequest {
    userRole: UserRole | null;
    userId: string | null;
  }
}

export const requireAuth: preHandlerHookHandler = async (request, reply) => {
  // Extract token from query parameter for SSE EventSource support
  const query = request.query as { token?: string } | undefined;
  if (query?.token) {
    request.headers.authorization = `Bearer ${query.token}`;
  }

  if (process.env.NODE_ENV === 'test') {
    // In test environment, allow mock auth bypassing remote Clerk JWKS calls
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    if (authHeader === 'Bearer invalid') {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    }
    // Set role and userId from headers (or defaults)
    const mockRole = (request.headers['x-mock-role'] as UserRole) ?? 'operator';
    const mockUserId = (request.headers['x-mock-user-id'] as string) ?? 'mock-user-id';
    request.userRole = mockRole;
    request.userId = mockUserId;
    return;
  }

  const auth = getAuth(request);
  if (!auth || !auth.userId) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }

  // Attach role from publicMetadata and set userId
  const publicMetadata = auth.sessionClaims?.publicMetadata as { role?: string } | undefined;
  const role = (publicMetadata?.role as UserRole) ?? null;
  request.userRole = role;
  request.userId = auth.userId;
};
