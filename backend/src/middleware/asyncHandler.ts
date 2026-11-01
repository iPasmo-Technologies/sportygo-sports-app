import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 ignores a rejected promise from an async route: the request never gets an answer and
// the unhandled rejection can stop the process. This passes the error to errorHandler instead.
export function asyncHandler<Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req as Req, res, next).catch(next);
  };
}
