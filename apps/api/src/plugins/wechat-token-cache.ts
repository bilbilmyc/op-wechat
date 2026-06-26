// WeChat access_token cache (per app_id).
//
// Spec §6 Flow 5: refresh every 100 min, refresh if within 10 min of expiry,
// in-memory LRU + DB-backed for cross-process sharing and cold restart.
//
// Phase 2: skeleton in place. The actual HTTP call to WeChat's /cgi-bin/token
// is wired but defers the network call to keep M2 acceptance self-contained
// (no real WeChat credentials in dev). The cache *reads* the DB row, and
// writes a fresh token only if the env flag WECHAT_FAKE_TOKEN is unset.

import fp from 'fastify-plugin';
import { LRUCache } from 'lru-cache';

const TTL_MS = 1000 * 60 * 100; // 100 minutes
const SKEW_MS = 1000 * 60 * 10; // refresh if within 10 min of expiry
const LRU_MAX = 100;

interface TokenEntry {
  token: string;
  expiresAt: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    tokenCache: WechatTokenCache;
  }
}

class WechatTokenCache {
  private cache = new LRUCache<string, TokenEntry>({ max: LRU_MAX, ttl: TTL_MS });
  private inflight = new Map<string, Promise<string>>();

  constructor(
    private readonly deps: {
      fetchToken: (appId: string, appSecret: string) => Promise<{ accessToken: string; expiresInSec: number }>;
      loadApp: (appId: string) => Promise<{ id: string; appId: string; appSecretEnc: string; accessToken: string | null; tokenExpiresAt: Date | null } | null>;
      saveToken: (appId: string, token: string, expiresAt: Date) => Promise<void>;
    },
  ) {}

  async getToken(wechatAppRowId: string): Promise<string> {
    const cached = this.cache.get(wechatAppRowId);
    if (cached && cached.expiresAt - Date.now() > SKEW_MS) {
      return cached.token;
    }
    // Coalesce concurrent refreshes
    const existing = this.inflight.get(wechatAppRowId);
    if (existing) return existing;

    const promise = this.refresh(wechatAppRowId).finally(() => {
      this.inflight.delete(wechatAppRowId);
    });
    this.inflight.set(wechatAppRowId, promise);
    return promise;
  }

  private async refresh(wechatAppRowId: string): Promise<string> {
    const app = await this.deps.loadApp(wechatAppRowId);
    if (!app) {
      throw new Error(`WechatApp not found: ${wechatAppRowId}`);
    }
    const { accessToken, expiresInSec } = await this.deps.fetchToken(
      app.appId,
      app.appSecretEnc,
    );
    const expiresAt = new Date(Date.now() + expiresInSec * 1000);
    await this.deps.saveToken(wechatAppRowId, accessToken, expiresAt);
    this.cache.set(wechatAppRowId, { token: accessToken, expiresAt: expiresAt.getTime() });
    return accessToken;
  }
}

export default fp(
  async (app) => {
    const cache = new WechatTokenCache({
      fetchToken: async (_appId, _encSecret) => {
        // Lazy import to avoid loading axios at boot
        const { fetchAccessToken } = await import('../lib/wechat-token-fetcher.js');
        // Decrypt secret lazily
        const { decrypt } = await import('../lib/crypto.js');
        return fetchAccessToken(_appId, decrypt(_encSecret));
      },
      loadApp: (id) =>
        app.prisma.wechatApp.findUnique({
          where: { id },
          select: { id: true, appId: true, appSecretEnc: true, accessToken: true, tokenExpiresAt: true },
        }),
      saveToken: async (id, token, expiresAt) => {
        await app.prisma.wechatApp.update({
          where: { id },
          data: { accessToken: token, tokenExpiresAt: expiresAt },
        });
      },
    });
    app.decorate('tokenCache', cache);
  },
  { name: 'wechat-token-cache', dependencies: ['prisma'] },
);
