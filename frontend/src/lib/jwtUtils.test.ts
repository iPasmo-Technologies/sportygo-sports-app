import { describe, expect, it } from 'vitest';
import { extractRoleFromToken } from '@/lib/jwtUtils';

// Real JWTs use base64url (no padding, "-" and "_" instead of "+" and "/").
function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function token(payload: unknown): string {
  return `${base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64Url(JSON.stringify(payload))}.signature`;
}

describe('extractRoleFromToken', () => {
  it.each(['public', 'coach', 'admin'] as const)('reads the %s role', (role) => {
    expect(extractRoleFromToken(token({ email: 'user@example.com', role, iat: 1, exp: 2 }))).toBe(role);
  });

  it.each([
    ['unknown role', token({ role: 'superuser' })],
    ['uppercase role', token({ role: 'ADMIN' })],
    ['missing role', token({ email: 'user@example.com' })],
    ['non-string role', token({ role: ['admin'] })],
    ['empty string', ''],
    ['two parts', 'header.payload'],
    ['four parts', 'a.b.c.d'],
    ['payload is not base64', 'header.%%%.signature'],
    ['payload is not JSON', `header.${base64Url('not json')}.signature`],
    ['payload is JSON null', `header.${base64Url('null')}.signature`],
  ])('falls back to "public" for %s', (_name, input) => {
    expect(extractRoleFromToken(input)).toBe('public');
  });

  // Regression: JWT payloads are base64url. An email with "?", ">" or "~" produces "-"/"_" in the
  // payload, which plain atob() rejects, so the role used to fall back to "public".
  const urlSafeAdminToken = token({ email: 'a?b@x.co', role: 'admin' });

  it('test setup: this admin token payload really contains "-" or "_"', () => {
    expect(urlSafeAdminToken.split('.')[1]).toMatch(/[-_]/);
  });

  it('reads the role when the payload uses base64url "-" or "_" characters', () => {
    expect(extractRoleFromToken(urlSafeAdminToken)).toBe('admin');
  });

  it.each(['coach', 'public'] as const)('reads a %s role from a base64url payload', (role) => {
    expect(extractRoleFromToken(token({ email: 'x?y>z~@x.co', role }))).toBe(role);
  });
});
