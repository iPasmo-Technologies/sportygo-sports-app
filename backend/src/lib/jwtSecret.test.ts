import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJwtSecret } from './jwtSecret';

const STRONG = 'k3Jx9qPz7Lw2Vb8Nf4Rt6Ym1Hc5Gd0Sa'; // 32 characters
const PRODUCTION_ERROR = /JWT_SECRET must be set to a random value of at least 32 characters/;

describe('getJwtSecret - production', () => {
  it('returns a strong secret', () => {
    expect(getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: STRONG })).toBe(STRONG);
  });

  it('trims surrounding spaces', () => {
    expect(getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: `  ${STRONG}\n` })).toBe(STRONG);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['spaces only', '     '],
    ['31 characters', STRONG.slice(0, 31)],
  ])('refuses a %s secret', (_name, secret) => {
    expect(() => getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: secret })).toThrow(PRODUCTION_ERROR);
  });

  // Long enough, but published in this repository: anyone could forge tokens with them.
  it.each([
    ['the old code fallback', 'dev-secret-change-in-production'],
    ['the backend/.env.example placeholder', 'change-this-to-a-long-random-secret-in-production'],
  ])('refuses %s', (_name, secret) => {
    expect(() => getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: secret })).toThrow(PRODUCTION_ERROR);
  });

  it('never includes the secret value in the error message', () => {
    const leaked = 'short-but-secret';
    expect(() => getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: leaked })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(leaked) })
    );
  });
});

describe('getJwtSecret - development and test', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns a configured secret without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(getJwtSecret({ NODE_ENV: 'development', JWT_SECRET: 'local-secret' })).toBe('local-secret');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([['development'], ['test'], [undefined]])(
    'falls back to a development-only secret with a warning when NODE_ENV is %s',
    (nodeEnv) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(getJwtSecret({ NODE_ENV: nodeEnv, JWT_SECRET: undefined })).toBe('dev-secret-change-in-production');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET is not set'));
    }
  );
});

describe('authMiddleware startup', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Regression: a missing JWT_SECRET silently fell back to a public string, so anyone could
  // sign an admin token. In production the server must now refuse to start instead.
  it('refuses to load in production without JWT_SECRET', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', undefined);
    await expect(import('../middleware/authMiddleware')).rejects.toThrow(PRODUCTION_ERROR);
  });

  it('loads in production with a strong JWT_SECRET', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', STRONG);
    await expect(import('../middleware/authMiddleware')).resolves.toBeDefined();
  });
});

describe('one source for the JWT secret', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
    });
  }

  // Two copies of the fallback could drift apart, or one could be left insecure.
  it('reads process.env.JWT_SECRET only in lib/jwtSecret.ts', () => {
    const srcDir = join(__dirname, '..');
    const readers = sourceFiles(srcDir)
      .filter((file) => /process\.env\.JWT_SECRET|env\.JWT_SECRET/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(srcDir.length + 1).replace(/\\/g, '/'));
    expect(readers).toEqual(['lib/jwtSecret.ts']);
  });
});
