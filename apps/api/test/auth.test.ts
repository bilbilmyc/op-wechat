import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/plugins/auth.js';

describe('password hashing', () => {
  it('hashPassword + verifyPassword roundtrip with correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt format
    await expect(verifyPassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('verifyPassword rejects wrong password', async () => {
    const hash = await hashPassword('hunter2');
    await expect(verifyPassword('hunter3', hash)).resolves.toBe(false);
  });

  it('hashPassword produces different hashes for the same input (random salt)', async () => {
    const a = await hashPassword('same-input');
    const b = await hashPassword('same-input');
    expect(a).not.toBe(b);
    await expect(verifyPassword('same-input', a)).resolves.toBe(true);
    await expect(verifyPassword('same-input', b)).resolves.toBe(true);
  });

  it('verifyPassword handles empty input as wrong', async () => {
    const hash = await hashPassword('not-empty');
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });
});
