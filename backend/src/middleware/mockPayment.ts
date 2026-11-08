import type { NextFunction, Request, Response } from 'express';

// Mock Pay creates confirmed bookings and coaching purchases without payment, so it must be switched
// on explicitly and can never run in production. Read per request so a config change needs no code change.
export function isMockPaymentEnabled(): boolean {
  return process.env.NODE_ENV !== 'production'
    && (process.env.MOCK_PAYMENT_ENABLED ?? '').trim().toLowerCase() === 'true';
}

// Put this before authMiddleware so a disabled endpoint answers 404 even without a login.
export function requireMockPaymentEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!isMockPaymentEnabled()) {
    // Same response as an unknown route, so the endpoint cannot be discovered.
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  next();
}
