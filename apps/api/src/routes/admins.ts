// Admin routes: list (admin-only).

import type { FastifyInstance } from 'fastify';

export default async function adminsRoutes(app: FastifyInstance) {
  app.get(
    '/admins',
    { preHandler: [app.authenticate] },
    async () => {
      const admins = await app.prisma.admin.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
      return { admins };
    },
  );
}
