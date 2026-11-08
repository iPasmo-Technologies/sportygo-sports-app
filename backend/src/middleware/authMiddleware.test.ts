import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { NextFunction, Response } from 'express';

// JWT_SECRET is read when the module loads, so set it before the import runs.
const SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret';
  return 'unit-test-secret';
});

import { authMiddleware, requireAdminRole, type AuthenticatedRequest } from './authMiddleware';

function run(
  middleware: typeof authMiddleware,
  req: Partial<AuthenticatedRequest>
) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const next = vi.fn();
  middleware(req as AuthenticatedRequest, res as unknown as Response, next as NextFunction);
  return { req, res, next };
}

function withAuthHeader(authorization?: string): Partial<AuthenticatedRequest> {
  return { headers: authorization === undefined ? {} : { authorization } };
}

function sign(payload: object, secret = SECRET, options: jwt.SignOptions = { expiresIn: '1h' }) {
  return jwt.sign(payload, secret, options);
}

function expectRejected(result: ReturnType<typeof run>, status: number, error: string) {
  expect(result.next).not.toHaveBeenCalled();
  expect(result.res.status).toHaveBeenCalledWith(status);
  expect(result.res.json).toHaveBeenCalledWith({ error });
  expect(result.req.user).toBeUndefined();
}

describe('authMiddleware - accepted tokens', () => {
  it.each(['public', 'coach', 'admin'])('accepts a valid %s token and sets req.user', (role) => {
    const result = run(authMiddleware, withAuthHeader(`Bearer ${sign({ email: 'user@example.com', role })}`));
    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.res.status).not.toHaveBeenCalled();
    expect(result.req.user).toEqual({ email: 'user@example.com', role });
  });

  it('copies only email and role onto req.user', () => {
    const token = sign({ email: 'user@example.com', role: 'public', isAdmin: true, extra: 'x' });
    const result = run(authMiddleware, withAuthHeader(`Bearer ${token}`));
    expect(result.req.user).toEqual({ email: 'user@example.com', role: 'public' });
  });
});

describe('authMiddleware - missing or malformed header (401)', () => {
  it.each([
    ['no header', undefined],
    ['empty header', ''],
    ['Basic scheme', 'Basic dXNlcjpwYXNz'],
    ['lowercase bearer', `bearer ${'x'.repeat(10)}`],
    ['token without scheme', 'abc.def.ghi'],
    ['"Bearer" with no space', 'Bearer'],
  ])('%s', (_name, header) => {
    expectRejected(run(authMiddleware, withAuthHeader(header)), 401, 'Authorization token is required.');
  });
});

describe('authMiddleware - invalid tokens (401)', () => {
  it.each([
    ['empty token', 'Bearer '],
    ['garbage token', 'Bearer not-a-jwt'],
    ['wrong secret', `Bearer ${sign({ email: 'a@b.co', role: 'admin' }, 'some-other-secret')}`],
    ['expired token', `Bearer ${sign({ email: 'a@b.co', role: 'admin', exp: Math.floor(Date.now() / 1000) - 60 }, SECRET, {})}`],
    ['unsigned (alg none) token', `Bearer ${jwt.sign({ email: 'a@b.co', role: 'admin' }, '', { algorithm: 'none' })}`],
  ])('%s', (_name, header) => {
    expectRejected(run(authMiddleware, withAuthHeader(header)), 401, 'Invalid or expired token.');
  });

  it('rejects a token whose payload was edited after signing', () => {
    const [header, , signature] = sign({ email: 'a@b.co', role: 'public' }).split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ email: 'a@b.co', role: 'admin' })).toString('base64url');
    const result = run(authMiddleware, withAuthHeader(`Bearer ${header}.${forgedPayload}.${signature}`));
    expectRejected(result, 401, 'Invalid or expired token.');
  });
});

describe('authMiddleware - valid signature but bad claims (403)', () => {
  const ROLE_ERROR = 'This account role is not permitted to access the application.';

  it.each([
    ['unknown role', { email: 'a@b.co', role: 'superuser' }],
    ['uppercase role', { email: 'a@b.co', role: 'ADMIN' }],
    ['missing role', { email: 'a@b.co' }],
    ['missing email', { role: 'admin' }],
    ['non-string email', { email: 123, role: 'admin' }],
    ['non-string role', { email: 'a@b.co', role: ['admin'] }],
  ])('%s', (_name, payload) => {
    expectRejected(run(authMiddleware, withAuthHeader(`Bearer ${sign(payload)}`)), 403, ROLE_ERROR);
  });
});

describe('requireAdminRole', () => {
  it('allows an admin', () => {
    const result = run(requireAdminRole, { user: { email: 'admin@example.com', role: 'admin' } });
    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.res.status).not.toHaveBeenCalled();
  });

  it.each([
    ['public user', { email: 'a@b.co', role: 'public' as const }],
    ['coach', { email: 'a@b.co', role: 'coach' as const }],
    ['no user (authMiddleware not run)', undefined],
  ])('blocks a %s', (_name, user) => {
    const result = run(requireAdminRole, { user });
    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.status).toHaveBeenCalledWith(403);
    expect(result.res.json).toHaveBeenCalledWith({ error: 'Admin role is required.' });
  });
});
