// Auth plugin: session-based admin auth.
// - POST /auth/login sets request.session.adminId
// - app.authenticate is a preHandler that loads the Admin row
//
// Uses @fastify/cookie + @fastify/session. Session secret from SESSION_SECRET env.

import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import bcrypt from 'bcryptjs';
import type { Admin } from '@prisma/client';

declare module 'fastify' {
  interface Session {
    adminId?: string;
  }
  interface FastifyRequest {
    admin?: Admin;
  }
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}

export default fp(
  async (app) => {
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      throw new Error('SESSION_SECRET environment variable is required');
    }
    if (sessionSecret.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters');
    }

    await app.register(fastifyCookie);
    await app.register(fastifySession, {
      secret: sessionSecret,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
      saveUninitialized: false,
    });

    app.decorate('authenticate', async (request: any, reply: any) => {
      if (!request.session?.adminId) {
        return reply.status(401).send({
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        });
      }
      const admin = await app.prisma.admin.findUnique({
        where: { id: request.session.adminId },
      });
      if (!admin) {
        await new Promise<void>((resolve) => request.session.destroy(() => resolve()));
        return reply.status(401).send({
          code: 'UNAUTHENTICATED',
          message: 'Session admin not found',
        });
      }
      request.admin = admin;
    });
  },
  { name: 'auth', dependencies: ['prisma'] },
);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
