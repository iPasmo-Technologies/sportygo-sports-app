import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  sendMail: vi.fn(),
  verify: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock('nodemailer', () => ({ default: { createTransport: mail.createTransport } }));

const SMTP = {
  SMTP_HOST: 'mail.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'support@example.com',
  SMTP_PASS: 'not-a-real-password',
  SMTP_FROM: 'SportyGo <support@example.com>',
};

// The SMTP settings are read when email.ts loads, so each test loads a fresh copy.
async function loadEmail(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('./email');
}

let logs: string[];
beforeEach(() => {
  logs = [];
  const capture = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'warn').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  mail.sendMail.mockResolvedValue({ accepted: ['x'], rejected: [] });
  mail.verify.mockResolvedValue(true);
  mail.createTransport.mockReturnValue({ sendMail: mail.sendMail, verify: mail.verify });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('SMTP connection settings', () => {
  it('uses direct TLS (secure) on port 465', async () => {
    const email = await loadEmail(SMTP);
    await email.sendWelcomeEmail({ email: 'user@example.com', fullName: 'Ana Tan' });
    expect(mail.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'mail.example.com', port: 465, secure: true,
      auth: { user: 'support@example.com', pass: 'not-a-real-password' },
    }));
  });

  it('uses STARTTLS (not secure) on port 587', async () => {
    const email = await loadEmail({ ...SMTP, SMTP_PORT: '587' });
    await email.sendWelcomeEmail({ email: 'user@example.com', fullName: 'Ana Tan' });
    expect(mail.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false }));
  });

  // Regression: without limits a blocked port made each send hang for minutes.
  it('sets short connection, greeting and socket timeouts', async () => {
    const email = await loadEmail(SMTP);
    await email.sendWelcomeEmail({ email: 'user@example.com', fullName: 'Ana Tan' });
    const options = mail.createTransport.mock.calls[0][0];
    expect(options.connectionTimeout).toBeLessThanOrEqual(15000);
    expect(options.greetingTimeout).toBeLessThanOrEqual(15000);
    expect(options.socketTimeout).toBeLessThanOrEqual(30000);
  });

  it('sends from SMTP_FROM to the customer', async () => {
    const email = await loadEmail(SMTP);
    await email.sendWelcomeEmail({ email: 'user@example.com', fullName: 'Ana Tan' });
    expect(mail.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'SportyGo <support@example.com>', to: 'user@example.com', subject: 'Welcome to the SportyGo family!',
    }));
  });
});

describe('when SMTP is not configured', () => {
  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'])('does not try to send without %s', async (missing) => {
    const email = await loadEmail({ ...SMTP, [missing]: '' });
    await email.sendWelcomeEmail({ email: 'user@example.com', fullName: 'Ana Tan' });
    expect(mail.createTransport).not.toHaveBeenCalled();
  });

  // Regression: the reset code and the customer's email were written to the server log.
  it('never logs the reset code or the email address in production', async () => {
    const email = await loadEmail({ ...SMTP, SMTP_PASS: '', NODE_ENV: 'production' });
    await email.sendPasswordResetPasscode({ email: 'user@example.com', code: '482913' });
    await email.sendWelcomeEmail({ email: 'user@example.com', fullName: 'Ana Tan' });
    const all = logs.join('\n');
    expect(all).not.toContain('482913');
    expect(all).not.toContain('user@example.com');
  });

  it('prints the reset code locally (outside production) so password reset can be tested without SMTP', async () => {
    const email = await loadEmail({ ...SMTP, SMTP_PASS: '', NODE_ENV: 'development' });
    await email.sendPasswordResetPasscode({ email: 'user@example.com', code: '482913' });
    expect(logs.join('\n')).toContain('482913');
  });
});

describe('logging never exposes customer emails or the SMTP password', () => {
  it('after a successful send', async () => {
    const email = await loadEmail(SMTP);
    await email.sendWelcomeEmail({ email: 'user@example.com', fullName: 'Ana Tan' });
    await email.sendPasswordResetPasscode({ email: 'user@example.com', code: '482913' });
    const all = logs.join('\n');
    expect(all).not.toContain('user@example.com');
    expect(all).not.toContain('482913');
    expect(all).not.toContain('not-a-real-password');
  });
});

describe('verifySmtpConnection', () => {
  it('reports "not-configured" without connecting', async () => {
    const email = await loadEmail({ ...SMTP, SMTP_HOST: '' });
    await expect(email.verifySmtpConnection()).resolves.toEqual({ status: 'not-configured' });
    expect(mail.verify).not.toHaveBeenCalled();
  });

  it('reports "ok" when the server accepts the login', async () => {
    const email = await loadEmail(SMTP);
    await expect(email.verifySmtpConnection()).resolves.toEqual({ status: 'ok' });
  });

  it.each([
    ['wrong password', 'EAUTH', 'Invalid login: 535 Incorrect authentication data'],
    ['blocked port', 'ETIMEDOUT', 'Connection timeout'],
    ['unknown host', 'EDNS', 'getaddrinfo ENOTFOUND mail.example.com'],
  ])('reports the error code for a %s', async (_name, code, message) => {
    mail.verify.mockRejectedValue(Object.assign(new Error(message), { code }));
    const email = await loadEmail(SMTP);
    await expect(email.verifySmtpConnection()).resolves.toEqual({ status: 'failed', code, message });
  });

  it('describes the settings for logs with the user masked and no password', async () => {
    const email = await loadEmail(SMTP);
    const summary = email.describeSmtpSettings();
    expect(summary).toBe('mail.example.com:465 (TLS) as su***@example.com');
    expect(summary).not.toContain('not-a-real-password');
  });
});
