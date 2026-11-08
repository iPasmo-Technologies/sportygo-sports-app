import type { NextFunction, Request, Response } from 'express';

// Last middleware: every error ends here. Details go to the server log only; the client gets a
// short generic message (Express's default handler would send an HTML page with the stack trace).
export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  // Raised by express.json() before any route runs.
  const type = (error as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body must be valid JSON.' });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large.' });
    return;
  }

  console.error(`[api] Unhandled error on ${req.method} ${req.originalUrl.split('?')[0]}:`, error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
