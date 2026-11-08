// The only place the JWT signing secret is read. Anyone who knows it can create a login token
// for any account, including admins, so production refuses to start without a strong one.

const MIN_PRODUCTION_LENGTH = 32;
const DEVELOPMENT_FALLBACK = 'dev-secret-change-in-production';

// Long enough to pass the length rule but published in this repository.
const PUBLISHED_PLACEHOLDERS = new Set([
  DEVELOPMENT_FALLBACK,
  'change-this-to-a-long-random-secret-in-production', // backend/.env.example
]);

type JwtEnv = { NODE_ENV?: string; JWT_SECRET?: string };

export function getJwtSecret(env: JwtEnv = process.env): string {
  const secret = (env.JWT_SECRET ?? '').trim();

  if (env.NODE_ENV === 'production') {
    if (secret.length < MIN_PRODUCTION_LENGTH || PUBLISHED_PLACEHOLDERS.has(secret)) {
      // Never include the value itself: this message ends up in deployment logs.
      throw new Error(
        `JWT_SECRET must be set to a random value of at least ${MIN_PRODUCTION_LENGTH} characters in production. ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"'
      );
    }
    return secret;
  }

  if (!secret) {
    console.warn('[auth] JWT_SECRET is not set; using an insecure development-only secret. Never deploy like this.');
    return DEVELOPMENT_FALLBACK;
  }
  return secret;
}
