import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use a fresh import per test by isolating the module under test from the cached
// module-level key. We can't easily reset the module-level cache, so we test
// the "missing key" path by clearing the env BEFORE importing the module.
describe('crypto (env validation)', () => {
  const original = process.env.APP_ENCRYPTION_KEY;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.APP_ENCRYPTION_KEY;
    } else {
      process.env.APP_ENCRYPTION_KEY = original;
    }
  });

  it('throws when APP_ENCRYPTION_KEY is not set', async () => {
    delete process.env.APP_ENCRYPTION_KEY;
    // dynamic import so the module loads with the current env (and a fresh
    // module-level key cache)
    vi.resetModules();
    const { encrypt } = await import('../src/lib/crypto.js');
    expect(() => encrypt('hello')).toThrowError(/APP_ENCRYPTION_KEY/);
  });

  it('throws when APP_ENCRYPTION_KEY is the wrong length', async () => {
    process.env.APP_ENCRYPTION_KEY = 'deadbeef'; // 8 hex chars, not 64
    vi.resetModules();
    const { encrypt } = await import('../src/lib/crypto.js');
    expect(() => encrypt('hello')).toThrowError(/must be 64 hex chars/);
  });

  it('throws when APP_ENCRYPTION_KEY is not valid hex', async () => {
    process.env.APP_ENCRYPTION_KEY = 'z'.repeat(64);
    vi.resetModules();
    const { encrypt } = await import('../src/lib/crypto.js');
    expect(() => encrypt('hello')).toThrow();
  });
});
