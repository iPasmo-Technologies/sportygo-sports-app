import 'dotenv/config';
import { describeSmtpSettings, sendWelcomeEmail, verifySmtpConnection } from '../lib/email';

// Usage:
//   npm run email:verify                    check connection and login only (sends nothing)
//   npm run email:verify -- you@example.com  also send a test (welcome) email to that address
// Uses the SMTP_* values from backend/.env or the environment. Never prints the password.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HINTS: Record<string, string> = {
  EAUTH: 'The server rejected the login: check SMTP_USER and SMTP_PASS, and that this mailbox may send mail.',
  ETIMEDOUT: 'No answer in time: the port may be blocked by a firewall or network, or SMTP_PORT is wrong.',
  ESOCKET: 'The connection failed: check SMTP_PORT (465 = TLS, 587 = STARTTLS) and any firewall.',
  ECONNECTION: 'The connection failed: check SMTP_HOST, SMTP_PORT and any firewall.',
  EDNS: 'SMTP_HOST could not be found: check the spelling.',
};

async function main() {
  const to = (process.argv[2] ?? '').trim();
  if (to && !EMAIL_RE.test(to)) {
    console.error('[email:verify] Usage: npm run email:verify -- [test-recipient@example.com]');
    process.exitCode = 1;
    return;
  }

  const check = await verifySmtpConnection();
  if (check.status === 'not-configured') {
    console.error('[email:verify] SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM.');
    process.exitCode = 1;
    return;
  }
  if (check.status === 'failed') {
    console.error(`[email:verify] FAILED for ${describeSmtpSettings()}: ${check.code ?? 'ERROR'} ${check.message}`);
    if (check.code && HINTS[check.code]) console.error(`[email:verify] Hint: ${HINTS[check.code]}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[email:verify] Connection and login OK: ${describeSmtpSettings()}`);

  if (to) {
    await sendWelcomeEmail({ email: to, fullName: 'SportyGo test' });
    console.log('[email:verify] Test email accepted by the server. Check the inbox (and the spam folder).');
  }
}

main().catch((error) => {
  console.error('[email:verify] Sending failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
