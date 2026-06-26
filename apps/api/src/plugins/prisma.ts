// Prisma client plugin. Decorates fastify with `app.prisma`.

import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export default fp(
  async (app) => {
    const prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn']
          : ['error', 'warn'],
    });
    await prisma.$connect();
    app.decorate('prisma', prisma);
    app.addHook('onClose', async () => {
      await prisma.$disconnect();
    });
  },
  { name: 'prisma' },
);
