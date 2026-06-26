import { describe, it, expect, vi } from 'vitest';
import { WechatTokenCache } from '../src/plugins/wechat-token-cache.js';

const appRow = {
  id: 'row-1',
  appId: 'wx-test',
  appSecretEnc: 'encrypted-secret',
  accessToken: null as string | null,
  tokenExpiresAt: null as Date | null,
};

type FetchResult = { accessToken: string; expiresInSec: number };

interface Deps {
  fetchToken: ReturnType<typeof vi.fn>;
  loadApp: ReturnType<typeof vi.fn>;
  saveToken: ReturnType<typeof vi.fn>;
}

function makeDeps(overrides?: Partial<Deps>): Deps {
  return {
    fetchToken: overrides?.fetchToken ?? vi.fn(async () => ({ accessToken: 'fresh-token', expiresInSec: 7200 })),
    loadApp: overrides?.loadApp ?? vi.fn(async () => ({ ...appRow })),
    saveToken: overrides?.saveToken ?? vi.fn(async () => {}),
  };
}

describe('WechatTokenCache', () => {
  it('throws when the wechat_apps row is missing', async () => {
    const deps = makeDeps({ loadApp: vi.fn(async () => null) });
    const cache = new WechatTokenCache(deps);
    await expect(cache.getToken('nope')).rejects.toThrow('WechatApp not found: nope');
  });

  it('fetches, saves, and caches a fresh token on first call', async () => {
    const deps = makeDeps();
    const cache = new WechatTokenCache(deps);
    const token = await cache.getToken(appRow.id);
    expect(token).toBe('fresh-token');
    expect(deps.fetchToken).toHaveBeenCalledTimes(1);
    expect(deps.saveToken).toHaveBeenCalledTimes(1);
  });

  it('returns the cached token on the second call without re-fetching', async () => {
    const deps = makeDeps();
    const cache = new WechatTokenCache(deps);
    await cache.getToken(appRow.id);
    const token2 = await cache.getToken(appRow.id);
    expect(token2).toBe('fresh-token');
    expect(deps.fetchToken).toHaveBeenCalledTimes(1);
    expect(deps.saveToken).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent refreshes into a single fetch', async () => {
    let resolveFetch!: (v: FetchResult) => void;
    const fetchToken = vi.fn(
      () =>
        new Promise<FetchResult>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const deps = makeDeps({ fetchToken });
    const cache = new WechatTokenCache(deps);
    const p1 = cache.getToken(appRow.id);
    const p2 = cache.getToken(appRow.id);
    const p3 = cache.getToken(appRow.id);
    // Wait for the microtask queue to drain so refresh() reaches the await
    // on fetchToken (the mocked fetchToken is a fresh pending Promise whose
    // resolve is captured into resolveFetch).
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(deps.fetchToken).toHaveBeenCalledTimes(1);
    resolveFetch({ accessToken: 'concurrent-token', expiresInSec: 7200 });
    const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
    expect(t1).toBe('concurrent-token');
    expect(t2).toBe('concurrent-token');
    expect(t3).toBe('concurrent-token');
    expect(deps.fetchToken).toHaveBeenCalledTimes(1);
    expect(deps.saveToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the cached token is within the skew window of expiry', async () => {
    // 5 min < 10 min skew → next call should refresh.
    const fetchToken = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: 'short-lived', expiresInSec: 5 * 60 })
      .mockResolvedValueOnce({ accessToken: 'refreshed-token', expiresInSec: 7200 });
    const deps = makeDeps({ fetchToken });
    const cache = new WechatTokenCache(deps);
    const t1 = await cache.getToken(appRow.id);
    const t2 = await cache.getToken(appRow.id);
    expect(t1).toBe('short-lived');
    expect(t2).toBe('refreshed-token');
    expect(deps.fetchToken).toHaveBeenCalledTimes(2);
  });

  it('keeps using the cached token when the expiry is comfortably in the future', async () => {
    const fetchToken = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: 'long-lived', expiresInSec: 7200 });
    const deps = makeDeps({ fetchToken });
    const cache = new WechatTokenCache(deps);
    await cache.getToken(appRow.id);
    const t2 = await cache.getToken(appRow.id);
    expect(t2).toBe('long-lived');
    expect(deps.fetchToken).toHaveBeenCalledTimes(1);
  });

  it('passes the row id, appId, and encrypted secret to deps correctly', async () => {
    const deps = makeDeps();
    const cache = new WechatTokenCache(deps);
    await cache.getToken(appRow.id);
    expect(deps.fetchToken).toHaveBeenCalledWith(appRow.appId, appRow.appSecretEnc);
    expect(deps.loadApp).toHaveBeenCalledWith(appRow.id);
  });
});
