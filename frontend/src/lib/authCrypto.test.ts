import { describe, expect, it } from 'vitest';
import { decryptLocalValue, encryptLocalValue, encryptPasswordForTransport } from '@/lib/authCrypto';

// The backend decrypts this exact format: see backend/src/lib/authCrypto.test.ts.
const PAYLOAD_FORMAT = /^v1\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$/;

// Changes a real byte. Editing the last base64 character is not enough: with "=" padding
// its low bits are ignored, so the decoded bytes may not change at all.
function flipFirstByte(base64: string): string {
  const binary = atob(base64);
  const flipped = String.fromCharCode(binary.charCodeAt(0) ^ 0xff) + binary.slice(1);
  return btoa(flipped);
}

describe('encryptPasswordForTransport', () => {
  it('produces "v1.<iv>.<cipher>" with a 12-byte IV', async () => {
    const payload = await encryptPasswordForTransport('Password@123');
    expect(payload).toMatch(PAYLOAD_FORMAT);
    expect(atob(payload.split('.')[1])).toHaveLength(12);
  });

  it('never contains the plain password', async () => {
    expect(await encryptPasswordForTransport('Password@123')).not.toContain('Password@123');
  });

  it('uses a fresh IV each time', async () => {
    const first = await encryptPasswordForTransport('Password@123');
    expect(await encryptPasswordForTransport('Password@123')).not.toBe(first);
  });

  it('is readable with the same shared key', async () => {
    const payload = await encryptPasswordForTransport('Password@123');
    await expect(decryptLocalValue(payload)).resolves.toBe('Password@123');
  });
});

describe('encryptLocalValue / decryptLocalValue', () => {
  it.each([
    ['simple', 'hello'],
    ['unicode', 'pässwörd-密码-🔒'],
    ['JSON', JSON.stringify({ email: 'a@b.co', password: 'x.y' })],
    ['empty string', ''],
    ['very long', 'x'.repeat(5000)],
  ])('round-trips a %s value', async (_name, value) => {
    await expect(decryptLocalValue(await encryptLocalValue(value))).resolves.toBe(value);
  });

  it('rejects a changed ciphertext', async () => {
    const [version, iv, cipher] = (await encryptLocalValue('hello')).split('.');
    await expect(decryptLocalValue(`${version}.${iv}.${flipFirstByte(cipher)}`)).rejects.toThrow();
  });

  it.each([
    ['empty string', ''],
    ['plain text', 'hello'],
    ['wrong version', 'v2.AAAA.BBBB'],
    ['missing cipher', 'v1.AAAA'],
    ['empty parts', 'v1..'],
  ])('rejects a malformed payload (%s)', async (_name, payload) => {
    await expect(decryptLocalValue(payload)).rejects.toThrow('Invalid encrypted payload format.');
  });
});
