import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret';
  return 'unit-test-secret';
});

// A database that is down: every call the routes below make fails.
vi.mock('../lib/database', () => {
  const down = () => vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
  return {
    listPackages: down(),
    listSports: down(),
    listSportEvents: down(),
    listSportFacilities: down(),
    findUserByEmail: down(),
    listBookingsByCustomer: down(),
  };
});
vi.mock('../lib/email', () => ({}));
vi.mock('../lib/stripe', () => ({}));
vi.mock('../lib/bookingPricing', () => ({}));
vi.mock('../lib/authCrypto', () => ({}));

import packagesRoutes from '../routes/packages';
import sportsRoutes from '../routes/sports';
import authRoutes from '../routes/auth';
import bookingsRoutes from '../routes/bookings';
import { errorHandler } from './errorHandler';

const app = express();
app.use(express.json({ limit: '1kb' }));
app.use('/api/packages', packagesRoutes);
app.use('/api/sports', sportsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use(errorHandler);

const TOKEN = jwt.sign({ email: 'user@example.com', role: 'public' }, SECRET, { expiresIn: '1h' });
const GENERIC_500 = { error: 'Something went wrong. Please try again.' };

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

// Regression: on Express 4 an async route that throws outside try/catch never answers, and the
// unhandled rejection can stop the whole server process.
describe('async route failures', () => {
  it.each([
    ['GET /api/packages', '/api/packages', false],
    ['GET /api/sports', '/api/sports', false],
    ['GET /api/sports/:id/events', '/api/sports/cricket/events', false],
    ['GET /api/sports/:id/facilities', '/api/sports/cricket/facilities', false],
    ['GET /api/auth/profile', '/api/auth/profile', true],
    ['GET /api/bookings', '/api/bookings', true],
  ])('%s answers 500 with a generic message when the database fails', async (_name, path, auth) => {
    const req = request(app).get(path).timeout(3000);
    const res = await (auth ? req.set('Authorization', `Bearer ${TOKEN}`) : req);
    expect(res.status).toBe(500);
    expect(res.body).toEqual(GENERIC_500);
  });

  it('never sends internal details (host, port, stack) to the client', async () => {
    const res = await request(app).get('/api/packages').timeout(3000);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|5432|at \w+ \(/);
  });

  it('logs the real error internally', async () => {
    await request(app).get('/api/packages').timeout(3000);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('GET /api/packages'), expect.any(Error));
  });
});

describe('request body errors', () => {
  it('answers 400 JSON (not an HTML error page) for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.co",')
      .timeout(3000);
    expect(res.status).toBe(400);
    expect(res.type).toBe('application/json');
    expect(res.body).toEqual({ error: 'Request body must be valid JSON.' });
  });

  it('answers 413 JSON for a body over the size limit', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.co', padding: 'x'.repeat(5000) })
      .timeout(3000);
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Request body is too large.' });
  });
});

describe('every async route is protected', () => {
  // Guard for new code: an async handler must be wrapped in asyncHandler(...) so its errors
  // reach errorHandler instead of crashing the process.
  it('wraps every async route handler with asyncHandler', () => {
    const routesDir = join(__dirname, '..', 'routes');
    const unwrapped = readdirSync(routesDir)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .flatMap((name) => readFileSync(join(routesDir, name), 'utf8')
        .split('\n')
        .map((line, index) => ({ name, line, number: index + 1 }))
        .filter(({ line }) => /^\s*router\.(get|post|put|patch|delete)\(/.test(line) && /\basync\b/.test(line)
          && !/asyncHandler\(async/.test(line))
        .map(({ name, number }) => `${name}:${number}`));
    expect(unwrapped).toEqual([]);
  });
});
