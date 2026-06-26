import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from '../src/lib/crypto.js';

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

describe('crypto (AES-256-GCM)', () => {
  it('roundtrips a string', () => {
    const plain = 'hello wechat world — 测试 🎉';
    const ct = encrypt(plain);
    expect(ct).not.toContain(plain);
    expect(decrypt(ct)).toBe(plain);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const plain = 'same input';
    const a = encrypt(plain);
    const b = encrypt(plain);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plain);
    expect(decrypt(b)).toBe(plain);
  });

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const ct = encrypt('sensitive');
    // Flip a character in the ciphertext portion
    const parts = ct.split('.');
    const ctB64 = parts[2]!;
    const tampered = ctB64.slice(0, -1) + (ctB64.endsWith('A') ? 'B' : 'A');
    const tamperedPayload = `${parts[0]}.${parts[1]}.${tampered}`;
    expect(() => decrypt(tamperedPayload)).toThrow();
  });

  it('rejects malformed payload', () => {
    expect(() => decrypt('not-a-valid-payload')).toThrow();
  });
});
