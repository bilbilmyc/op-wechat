// apps/api — main entrypoint.
//
// Registers:
//   1. prisma plugin (DB client)
//   2. auth plugin (session + authenticate preHandler)
//   3. wechat-token-cache plugin (per-app access_token cache)
//   4. routes: auth, admins, apps
// Plus: /healthz

import Fastify from 'fastify';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import wechatTokenCachePlugin from './plugins/wechat-token-cache.js';
import authRoutes from './routes/auth.js';
import adminsRoutes from './routes/admins.js';
import appsRoutes from './routes/apps.js';
import { setErrorHandler } from './plugins/error-handler.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = '0.0.0.0';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.NODE_ENV === 'production'
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }),
  },
  disableRequestLogging: false,
  trustProxy: true,
});

setErrorHandler(app);

app.get('/healthz', async () => ({
  status: 'ok',
  service: 'api',
  version: '0.1.0',
  uptime_seconds: Math.round(process.uptime()),
}));

const start = async () => {
  try {
    // Order matters: prisma first, then auth (depends on prisma), then routes.
    await app.register(prismaPlugin);
    await app.register(authPlugin);
    await app.register(wechatTokenCachePlugin);

    await app.register(authRoutes);
    await app.register(adminsRoutes);
    await app.register(appsRoutes);

    await app.listen({ port: PORT, host: HOST });
    app.log.info({ port: PORT }, 'api listening');
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'shutdown error');
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start();
