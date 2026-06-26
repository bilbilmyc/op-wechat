// AES-256-GCM encryption for at-rest secrets (wechat_apps.app_secret, encoding_aes_key).
//
// Format: base64(iv).base64(tag).base64(ciphertext). IV is 12 bytes random
// per encryption. Tag is 16 bytes. The 32-byte key comes from
// APP_ENCRYPTION_KEY (64 hex chars).

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;
const KEY_HEX_LEN = KEY_LEN * 2;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.APP_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('APP_ENCRYPTION_KEY environment variable is not set');
  }
  if (hex.length !== KEY_HEX_LEN) {
    throw new Error(
      `APP_ENCRYPTION_KEY must be ${KEY_HEX_LEN} hex chars (got ${hex.length})`,
    );
  }
  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const key = getKey();
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }
  const [ivB64, tagB64, ctB64] = parts;
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('Invalid encrypted payload parts');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  if (iv.length !== IV_LEN) {
    throw new Error(`Invalid IV length: ${iv.length}`);
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
  return decrypted.toString('utf8');
}
