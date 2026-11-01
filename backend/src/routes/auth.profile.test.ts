import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret';
  return 'unit-test-secret';
});

vi.mock('../lib/database', () => ({ updateUserProfile: vi.fn() }));
vi.mock('../lib/email', () => ({}));
vi.mock('../lib/authCrypto', () => ({}));

import { updateUserProfile } from '../lib/database';
import { errorHandler } from '../middleware/errorHandler';
import authRoutes from './auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

const EMAIL = 'user@example.com';
const TOKEN = jwt.sign({ email: EMAIL, role: 'public' }, SECRET, { expiresIn: '1h' });
const VALID = { fullName: 'Ana Tan', mobileNumber: '+6591234567' };

function putProfile(body: unknown, token: string | null = TOKEN) {
  const req = request(app).put('/api/auth/profile').send(body as object).timeout(3000);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

beforeEach(() => {
  vi.mocked(updateUserProfile).mockImplementation(async (input) => ({
    id: 'u1',
    email: input.email,
    fullName: input.fullName,
    mobileNumber: input.mobileNumber,
    passwordEncrypted: 'x',
    authProvider: 'password',
    role: 'public',
    passwordResetCode: null,
    passwordResetExpiresAt: null,
  }));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('PUT /api/auth/profile - success', () => {
  it('updates and returns the trimmed profile', async () => {
    const res = await putProfile({ fullName: '  Ana Tan ', mobileNumber: ' +6591234567 ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ fullName: 'Ana Tan', email: EMAIL, mobileNumber: '+6591234567' });
  });

  it('only ever updates the logged-in account, ignoring an email in the body', async () => {
    await putProfile({ ...VALID, email: 'victim@example.com' });
    expect(updateUserProfile).toHaveBeenCalledWith({ email: EMAIL, fullName: 'Ana Tan', mobileNumber: '+6591234567' });
  });

  it.each([
    ['2-character name', 'Al'],
    ['100-character name', 'a'.repeat(100)],
  ])('accepts a %s', async (_name, fullName) => {
    expect((await putProfile({ ...VALID, fullName })).status).toBe(200);
  });
});

describe('PUT /api/auth/profile - invalid input (400, nothing saved)', () => {
  it.each([
    ['missing name', { mobileNumber: VALID.mobileNumber }, 'Full name is required.'],
    ['blank name', { ...VALID, fullName: '   ' }, 'Full name is required.'],
    ['name that is a number', { ...VALID, fullName: 123 }, 'Full name is required.'],
    ['name that is an object', { ...VALID, fullName: { first: 'Ana' } }, 'Full name is required.'],
    ['1-character name', { ...VALID, fullName: 'A' }, 'Name must be at least 2 characters.'],
    ['101-character name', { ...VALID, fullName: 'a'.repeat(101) }, 'Name must be at most 100 characters.'],
    ['missing mobile', { fullName: VALID.fullName }, 'Mobile number is required.'],
    ['mobile that is a number', { ...VALID, mobileNumber: 6591234567 }, 'Mobile number is required.'],
    ['mobile with letters', { ...VALID, mobileNumber: '+65abc4567' }, 'Enter a valid mobile number.'],
    ['mobile too short', { ...VALID, mobileNumber: '1234567' }, 'Enter a valid mobile number.'],
    ['mobile too long', { ...VALID, mobileNumber: '1234567890123456' }, 'Enter a valid mobile number.'],
  ])('%s', async (_name, body, error) => {
    const res = await putProfile(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(updateUserProfile).not.toHaveBeenCalled();
  });
});

describe('PUT /api/auth/profile - other outcomes', () => {
  it('requires a login', async () => {
    expect((await putProfile(VALID, null)).status).toBe(401);
    expect(updateUserProfile).not.toHaveBeenCalled();
  });

  it('answers 404 when the account no longer exists', async () => {
    vi.mocked(updateUserProfile).mockResolvedValue(null);
    expect((await putProfile(VALID)).status).toBe(404);
  });

  // Regression: any error message, including database internals, was sent to the browser as a 400.
  it('answers a generic 500 for a database failure, without internal details', async () => {
    vi.mocked(updateUserProfile).mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await putProfile(VALID);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong. Please try again.' });
  });
});
