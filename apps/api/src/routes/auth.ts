// Auth routes: login, logout, me.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyPassword } from '../plugins/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid login payload',
        details: parsed.error.flatten(),
      });
    }
    const { email, password } = parsed.data;
    const admin = await app.prisma.admin.findUnique({ where: { email } });
    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      return reply.status(401).send({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }
    request.session.adminId = admin.id;
    // Explicitly save the session so the Set-Cookie header is on this response.
    // @fastify/session v10's onResponse save hook should also do this, but
    // we've seen it miss manual property assignments in some setups.
    await new Promise<void>((resolve, reject) =>
      request.session.save((err: Error | null | undefined) => (err ? reject(err) : resolve())),
    );
    return reply.send({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    });
  });

  app.post('/auth/logout', async (request, reply) => {
    if (request.session) {
      await new Promise<void>((resolve) => request.session.destroy(() => resolve()));
    }
    return reply.send({ ok: true });
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    const admin = request.admin!;
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
  });
}
