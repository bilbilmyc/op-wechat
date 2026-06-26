// apps/scheduler — pg-boss workers + lightweight HTTP for liveness.
//
// Phase 1: connects to Postgres via pg-boss, exposes /healthz. No workers yet.
// Phase 3 (M3) starts the rule.evaluate and sse.fanout queues.
// Phase 4 (M4) adds message-send-retry. Phase 5+ adds the rest.

import Fastify, { type FastifyInstance } from 'fastify';
import PgBoss from 'pg-boss';
import { setErrorHandler } from './plugins/error-handler.js';

const PORT = Number(process.env.PORT ?? 3003);
const HOST = '0.0.0.0';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const app: FastifyInstance = Fastify({
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
  trustProxy: true,
});

setErrorHandler(app);

let boss: PgBoss | null = null;
let bossStarted = false;
let bossError: string | null = null;

app.get('/healthz', async (_request, reply) => {
  if (!bossStarted) {
    return reply.status(503).send({
      status: 'starting',
      service: 'scheduler',
      boss: bossError ? 'failed' : 'initializing',
      error: bossError,
    });
  }
  return {
    status: 'ok',
    service: 'scheduler',
    version: '0.1.0',
    uptime_seconds: Math.round(process.uptime()),
  };
});

const start = async () => {
  try {
    boss = new PgBoss({
      connectionString: DATABASE_URL,
      // Reasonable defaults; revisit when we add real workers
      retentionDays: 7,
    });
    boss.on('error', (err) => {
      app.log.error({ err }, 'pg-boss error');
      bossError = err.message;
    });
    await boss.start();
    bossStarted = true;
    app.log.info('pg-boss started');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    app.log.error({ err }, 'pg-boss start failed');
    bossError = message;
    // Continue so /healthz can report 503 and ops can see the failure
  }

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info({ port: PORT }, 'scheduler listening');
  } catch (err) {
    app.log.error({ err }, 'failed to start HTTP');
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  try {
    if (boss) await boss.stop({ graceful: true, wait: true });
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
