import { isDatabaseConfigured, promoteUserToAdmin } from '../lib/database';

// Usage: npm run admin:promote -- someone@example.com
// The person must first register through the app. Only their role changes.

function maskEmail(email: string): string {
  const [localPart, domain] = email.trim().toLowerCase().split('@');
  if (!localPart || !domain) return '***';
  return `${localPart.slice(0, 2)}***@${domain}`;
}

async function main() {
  const email = process.argv[2] ?? '';
  if (!email) {
    console.error('[admin:promote] Usage: npm run admin:promote -- <registered-email>');
    process.exitCode = 1;
    return;
  }

  if (!isDatabaseConfigured()) {
    console.error('[admin:promote] DATABASE_URL is not configured.');
    process.exitCode = 1;
    return;
  }

  const result = await promoteUserToAdmin(email);
  const who = maskEmail(email);

  if (result === 'promoted') {
    console.log(`[admin:promote] ${who} is now an admin. They must log out and log in again to get admin access.`);
  } else if (result === 'already-admin') {
    console.log(`[admin:promote] ${who} is already an admin. Nothing changed.`);
  } else {
    console.error(`[admin:promote] No active account found for ${who}. Ask them to register first.`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('[admin:promote] Failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  // The open database pool would otherwise keep the process alive for ~30 seconds.
  .finally(() => process.exit());
