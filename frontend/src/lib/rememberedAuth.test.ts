import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptLocalValue } from '@/lib/authCrypto';
import { clearRememberedAuth, readRememberedAuth, saveRememberedAuth } from '@/lib/rememberedAuth';

const STORAGE_KEY = 'sg_booking_app_remembered_auth_v1';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

// Note: storing the password at all is a known security issue (planned fix in Phase 3.6).
// These tests describe today's behaviour and will change with that fix.
describe('rememberedAuth', () => {
  it('returns null when nothing is saved', async () => {
    await expect(readRememberedAuth()).resolves.toBeNull();
  });

  it('saves and reads back email and password', async () => {
    await saveRememberedAuth({ email: 'user@example.com', password: 'Password@123' });
    await expect(readRememberedAuth()).resolves.toEqual({ email: 'user@example.com', password: 'Password@123' });
  });

  it('does not store the password as readable text', async () => {
    await saveRememberedAuth({ email: 'user@example.com', password: 'Password@123' });
    const stored = localStorage.getItem(STORAGE_KEY)!;
    expect(stored).not.toContain('Password@123');
    expect(stored).not.toContain('user@example.com');
  });

  it('forgets the saved login after clear', async () => {
    await saveRememberedAuth({ email: 'user@example.com', password: 'Password@123' });
    clearRememberedAuth();
    await expect(readRememberedAuth()).resolves.toBeNull();
  });

  it('returns null for data that is not encrypted', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: 'a@b.co', password: 'x' }));
    await expect(readRememberedAuth()).resolves.toBeNull();
  });

  it.each([
    ['missing password', { email: 'a@b.co' }],
    ['missing email', { password: 'x' }],
    ['empty password', { email: 'a@b.co', password: '' }],
  ])('returns null for a saved value with %s', async (_name, value) => {
    localStorage.setItem(STORAGE_KEY, await encryptLocalValue(JSON.stringify(value)));
    await expect(readRememberedAuth()).resolves.toBeNull();
  });

  it('does not throw when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    await expect(saveRememberedAuth({ email: 'a@b.co', password: 'x' })).resolves.toBeUndefined();
    expect(() => clearRememberedAuth()).not.toThrow();
  });
});
