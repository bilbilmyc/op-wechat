// wechat_apps CRUD.
//
// v1 supports 2+ apps in one installation. Schema permits it from day 1.
// Encrypts app_secret and encoding_aes_key at rest using APP_ENCRYPTION_KEY.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { encrypt } from '../lib/crypto.js';

const createAppSchema = z.object({
  name: z.string().min(1).max(100),
  appId: z.string().min(1).max(100),
  appSecret: z.string().min(1).max(500),
  token: z.string().min(1).max(100),
  encodingAesKey: z.string().min(1).max(100),
  type: z.enum(['subscription', 'service']),
  avatarUrl: z.string().url().optional(),
  qrUrl: z.string().url().optional(),
  broadcastRatePerMin: z.number().int().positive().max(10000).optional(),
});

const updateAppSchema = z
  .object({
    name: z.string().min(1).max(100),
    appId: z.string().min(1).max(100),
    appSecret: z.string().min(1).max(500),
    token: z.string().min(1).max(100),
    encodingAesKey: z.string().min(1).max(100),
    type: z.enum(['subscription', 'service']),
    avatarUrl: z.string().url().nullable().optional(),
    qrUrl: z.string().url().nullable().optional(),
    broadcastRatePerMin: z.number().int().positive().max(10000),
    disabled: z.boolean(),
  })
  .partial();

const APP_LIST_SELECT = {
  id: true,
  name: true,
  appId: true,
  type: true,
  avatarUrl: true,
  qrUrl: true,
  accessToken: true,
  tokenExpiresAt: true,
  broadcastRatePerMin: true,
  disabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

export default async function appsRoutes(app: FastifyInstance) {
  // List
  app.get('/apps', { preHandler: [app.authenticate] }, async () => {
    const apps = await app.prisma.wechatApp.findMany({
      orderBy: { createdAt: 'asc' },
      select: APP_LIST_SELECT,
    });
    return { apps };
  });

  // Get one
  app.get<{ Params: { id: string } }>(
    '/apps/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const app_ = await app.prisma.wechatApp.findUnique({
        where: { id: request.params.id },
        select: APP_LIST_SELECT,
      });
      if (!app_) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App not found' });
      }
      return app_;
    },
  );

  // Create
  app.post('/apps', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createAppSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }
    const { appSecret, encodingAesKey, broadcastRatePerMin, ...rest } = parsed.data;
    try {
      const created = await app.prisma.wechatApp.create({
        data: {
          ...rest,
          appSecretEnc: encrypt(appSecret),
          encodingAesKey: encrypt(encodingAesKey),
          ...(broadcastRatePerMin !== undefined ? { broadcastRatePerMin } : {}),
        },
        select: APP_LIST_SELECT,
      });
      return reply.status(201).send(created);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        return reply.status(409).send({
          code: 'APP_ID_CONFLICT',
          message: 'A wechat app with this app_id already exists',
        });
      }
      throw err;
    }
  });

  // Update (partial)
  app.patch<{ Params: { id: string } }>(
    '/apps/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = updateAppSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid payload',
          details: parsed.error.flatten(),
        });
      }
      const data: Record<string, unknown> = { ...parsed.data };
      if (typeof parsed.data.appSecret === 'string') {
        data.appSecretEnc = encrypt(parsed.data.appSecret);
        delete data.appSecret;
      }
      if (typeof parsed.data.encodingAesKey === 'string') {
        data.encodingAesKey = encrypt(parsed.data.encodingAesKey);
        delete data.encodingAesKey;
      }
      try {
        const updated = await app.prisma.wechatApp.update({
          where: { id: request.params.id },
          data,
          select: APP_LIST_SELECT,
        });
        return updated;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err) {
          const code = (err as { code: string }).code;
          if (code === 'P2025') {
            return reply.status(404).send({ code: 'NOT_FOUND', message: 'App not found' });
          }
          if (code === 'P2002') {
            return reply.status(409).send({
              code: 'APP_ID_CONFLICT',
              message: 'A wechat app with this app_id already exists',
            });
          }
        }
        throw err;
      }
    },
  );

  // Delete
  app.delete<{ Params: { id: string } }>(
    '/apps/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        await app.prisma.wechatApp.delete({ where: { id: request.params.id } });
        return reply.status(204).send();
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2025') {
          return reply.status(404).send({ code: 'NOT_FOUND', message: 'App not found' });
        }
        throw err;
      }
    },
  );
}
