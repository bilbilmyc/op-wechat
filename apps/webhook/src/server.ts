// apps/webhook — inbound receiver for WeChat pushes.
//
// Phase 1: /healthz + /webhook/:app_id placeholder that returns 'success'.
// Phase 3 (M3) replaces the placeholder with the real flow: signature verify,
// XML parse, AES decrypt, persist, enqueue rule.evaluate + sse.fanout.
//
// WeChat requires a 5-second response. The placeholder is well under that.

import Fastify, { type FastifyInstance } from 'fastify';
import { setErrorHandler } from './plugins/error-handler.js';

const PORT = Number(process.env.PORT ?? 3002);
const HOST = '0.0.0.0';

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
  bodyLimit: 10 * 1024 * 1024, // 10 MB; WeChat messages are tiny but be safe
  trustProxy: true,
});

setErrorHandler(app);

app.get('/healthz', async () => ({
  status: 'ok',
  service: 'webhook',
  version: '0.1.0',
  uptime_seconds: Math.round(process.uptime()),
}));

// WeChat's GET verification handshake (used during webhook configuration).
// Phase 1: accept any signature and echo nothing (placeholder).
// Phase 3: verify signature per spec §6 Flow 1 step 1.
app.get<{ Params: { app_id: string }; Querystring: { signature?: string; timestamp?: string; nonce?: string; echostr?: string } }>(
  '/webhook/:app_id',
  async (request, reply) => {
    const { app_id } = request.params;
    const { echostr } = request.query;
    request.log.info({ app_id }, 'webhook verification GET (placeholder)');
    return reply.status(200).send(echostr ?? 'success');
  },
);

// WeChat's POST push of messages and events.
// Phase 1: log and return 'success' to keep WeChat happy.
// Phase 3: implement the real inbound flow (XML content type parser, signature
// verify, decrypt, persist, enqueue).
app.post<{ Params: { app_id: string } }>('/webhook/:app_id', async (request, reply) => {
  const { app_id } = request.params;
  const bodyLength =
    typeof request.body === 'string'
      ? request.body.length
      : request.body
        ? JSON.stringify(request.body).length
        : 0;
  request.log.info({ app_id, body_size: bodyLength }, 'inbound POST (placeholder)');
  return reply.status(200).send('success');
});

const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info({ port: PORT }, 'webhook listening');
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
