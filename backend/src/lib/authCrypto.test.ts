import { createHash, webcrypto } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

// Both keys are read when the module loads, so set them before the import runs.
const KEYS = vi.hoisted(() => {
  process.env.VITE_AUTH_PAYLOAD_KEY = 'unit-test-payload-key';
  process.env.PASSWORD_AT_REST_KEY = 'unit-test-at-rest-key';
  return { payload: 'unit-test-payload-key', atRest: 'unit-test-at-rest-key' };
});

import { decryptClientPasswordPayload, decryptPasswordAtRest, encryptPasswordAtRest } from './authCrypto';

const PAYLOAD_FORMAT = /^v1\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$/;

// Same algorithm as frontend/src/lib/authCrypto.ts (AES-GCM, SHA-256 of the shared key,
// 12-byte IV, "v1.<iv>.<cipher>"). Keeps the browser-to-server contract under test.
async function encryptLikeFrontend(value: string, secret: string): Promise<string> {
  const keyBytes = createHash('sha256').update(secret, 'utf8').digest();
  const key = await webcrypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return `v1.${Buffer.from(iv).toString('base64')}.${Buffer.from(cipher).toString('base64')}`;
}

// Changes a real byte. Editing the last base64 character is not enough: with "=" padding
// its low bits are ignored, so the decoded bytes may not change at all.
function flipFirstByte(base64: string): string {
  const bytes = Buffer.from(base64, 'base64');
  bytes[0] ^= 0xff;
  return bytes.toString('base64');
}

const SAMPLE_PASSWORDS = [
  ['simple', 'Password@123'],
  ['unicode', 'pässwörd-密码-🔒'],
  ['contains dots', 'a.b.c.d'],
  ['spaces', '  spaced out  '],
  ['empty string', ''],
  ['very long', 'x'.repeat(1000)],
];

describe('encryptPasswordAtRest / decryptPasswordAtRest', () => {
  it('produces the "v1.<iv>.<cipher>" format with a 12-byte IV', async () => {
    const payload = await encryptPasswordAtRest('Password@123');
    expect(payload).toMatch(PAYLOAD_FORMAT);
    expect(Buffer.from(payload.split('.')[1], 'base64')).toHaveLength(12);
  });

  it.each(SAMPLE_PASSWORDS)('round-trips a %s password', async (_name, password) => {
    const payload = await encryptPasswordAtRest(password);
    await expect(decryptPasswordAtRest(payload)).resolves.toBe(password);
  });

  it('uses a fresh IV, so the same password encrypts differently each time', async () => {
    const first = await encryptPasswordAtRest('Password@123');
    const second = await encryptPasswordAtRest('Password@123');
    expect(first).not.toBe(second);
  });

  it('never contains the plain password', async () => {
    const payload = await encryptPasswordAtRest('Password@123');
    expect(payload).not.toContain('Password@123');
  });

  it('rejects a payload whose ciphertext was changed', async () => {
    const [version, iv, cipher] = (await encryptPasswordAtRest('Password@123')).split('.');
    await expect(decryptPasswordAtRest(`${version}.${iv}.${flipFirstByte(cipher)}`)).rejects.toThrow();
  });

  it('rejects a payload whose IV was changed', async () => {
    const [version, iv, cipher] = (await encryptPasswordAtRest('Password@123')).split('.');
    await expect(decryptPasswordAtRest(`${version}.${flipFirstByte(iv)}.${cipher}`)).rejects.toThrow();
  });

  it.each([
    ['empty string', ''],
    ['plain text', 'Password@123'],
    ['wrong version', 'v2.AAAA.BBBB'],
    ['missing cipher', 'v1.AAAA'],
    ['missing iv and cipher', 'v1.'],
    ['empty parts', 'v1..'],
  ])('rejects a malformed payload (%s)', async (_name, payload) => {
    await expect(decryptPasswordAtRest(payload)).rejects.toThrow('Invalid encrypted payload format.');
  });

  it('cannot be decrypted with the client payload key', async () => {
    const payload = await encryptPasswordAtRest('Password@123');
    await expect(decryptClientPasswordPayload(payload)).rejects.toThrow();
  });
});

describe('decryptClientPasswordPayload (browser -> server contract)', () => {
  it.each(SAMPLE_PASSWORDS)('decrypts a %s password encrypted the way the frontend does', async (_name, password) => {
    const payload = await encryptLikeFrontend(password, KEYS.payload);
    await expect(decryptClientPasswordPayload(payload)).resolves.toBe(password);
  });

  it('rejects a payload encrypted with a different key', async () => {
    const payload = await encryptLikeFrontend('Password@123', 'some-other-key');
    await expect(decryptClientPasswordPayload(payload)).rejects.toThrow();
  });

  it('rejects a payload encrypted with the at-rest key', async () => {
    const payload = await encryptLikeFrontend('Password@123', KEYS.atRest);
    await expect(decryptClientPasswordPayload(payload)).rejects.toThrow();
  });

  it('rejects a malformed payload', async () => {
    await expect(decryptClientPasswordPayload('not-encrypted')).rejects.toThrow('Invalid encrypted payload format.');
  });
});
