import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const SUPPORTED_ROLES = ['public', 'coach', 'admin'] as const;
export type UserRole = (typeof SUPPORTED_ROLES)[number];

export interface AuthenticatedRequest extends Request {
  user?: { email: string; role: UserRole };
}

function isSupportedRole(role: unknown): role is UserRole {
  return typeof role === 'string' && SUPPORTED_ROLES.includes(role as UserRole);
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization token is required.' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { email?: unknown; role?: unknown };
    if (typeof decoded.email !== 'string' || !isSupportedRole(decoded.role)) {
      res.status(403).json({ error: 'This account role is not permitted to access the application.' });
      return;
    }

    req.user = { email: decoded.email, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function requireAdminRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin role is required.' });
    return;
  }

  next();
}
