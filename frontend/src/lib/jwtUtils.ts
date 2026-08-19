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

    // Decode the payload (second part)
    const payload = JSON.parse(atob(parts[1])) as { role?: string };
    const role = payload.role;

    if (role === 'public' || role === 'coach' || role === 'admin') {
      return role;
    }

    return 'public';
  } catch {
    return 'public';
  }
}
