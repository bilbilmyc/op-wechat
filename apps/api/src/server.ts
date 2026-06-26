// apps/api — main entrypoint.
//
// Phase 1: Fastify + pino + error handler + /healthz. No business logic yet.
// Subsequent phases (M2+) add: Prisma, auth, app management, messages, fans, etc.

import Fastify from 'fastify';
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
