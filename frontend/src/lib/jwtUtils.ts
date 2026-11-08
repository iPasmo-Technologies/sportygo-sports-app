import type { UserRole } from '@/types';

/**
 * Decode JWT token and extract user role
 * @param token JWT token
 * @returns User role or 'public' as fallback
 */
export function extractRoleFromToken(token: string): UserRole {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return 'public';
    }

    // JWT payloads are base64url ("-", "_", no padding); atob() only accepts standard base64.
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as { role?: string };
    const role = payload.role;

    if (role === 'public' || role === 'coach' || role === 'admin') {
      return role;
    }

    return 'public';
  } catch {
    return 'public';
  }
}
