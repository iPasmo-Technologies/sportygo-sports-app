import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { completePasswordReset, countUsersByMobileNumber, createUserPasswordAccount, findUserByEmail, findUserByEmailOrMobile, savePasswordResetCode, verifyPasswordResetCode } from '../lib/database';
import { decryptClientPasswordPayload, decryptPasswordAtRest, encryptPasswordAtRest } from '../lib/authCrypto';
import { sendPasswordResetPasscode, sendWelcomeEmail } from '../lib/email';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/authMiddleware';

const router = Router();

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\+?[0-9]{8,15}$/;
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

function notifyWelcomeEmail(input: Parameters<typeof sendWelcomeEmail>[0]): void {
  void sendWelcomeEmail(input).catch((error) => {
    console.error(`[auth:welcome] Welcome email failed for ${maskEmail(input.email)}`, error);
  });
}

router.get('/profile', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const user = await findUserByEmail(req.user?.email ?? '');

  if (!user) {
    res.status(404).json({ error: 'Account profile was not found.' });
    return;
  }

  res.json({
    fullName: user.fullName,
    email: user.email,
    mobileNumber: user.mobileNumber,
  });
});

router.post('/register', async (req, res) => {
  const {
    email,
    name,
    mobileNumber,
    encryptedPassword,
  } = req.body as {
    email?: string;
    name?: string;
    mobileNumber?: string;
    encryptedPassword?: string;
  };

  const normalizedEmail = normalizeEmail(email ?? '');
  const normalizedName = (name ?? '').trim();
  const normalizedMobile = (mobileNumber ?? '').trim();

  if (!normalizedName || normalizedName.length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters.' });
    return;
  }

  if (!normalizedMobile || !MOBILE_RE.test(normalizedMobile)) {
    res.status(400).json({ error: 'Enter a valid mobile number.' });
    return;
  }

  if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  if (!encryptedPassword) {
    res.status(400).json({ error: 'Encrypted password is required.' });
    return;
  }

  let plainPassword = '';
  try {
    plainPassword = await decryptClientPasswordPayload(encryptedPassword);
  } catch {
    res.status(400).json({ error: 'Unable to decrypt password payload.' });
    return;
  }

  if (plainPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const storedEncryptedPassword = await encryptPasswordAtRest(plainPassword);

  try {
    await createUserPasswordAccount({
      email: normalizedEmail,
      fullName: normalizedName,
      mobileNumber: normalizedMobile,
      passwordEncrypted: storedEncryptedPassword,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create account.';
    if (/already exists/i.test(message)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    res.status(500).json({ error: 'Unable to create account. Please try again.' });
    return;
  }

  notifyWelcomeEmail({
    email: normalizedEmail,
    fullName: normalizedName,
  });

  const token = jwt.sign({ email: normalizedEmail, role: 'public' }, JWT_SECRET, { expiresIn: '24h' });
  res.status(201).json({ token, email: normalizedEmail });
});

router.post('/login', async (req, res) => {
  const {
    email,
    loginId,
    encryptedPassword,
  } = req.body as {
    email?: string;
    loginId?: string;
    encryptedPassword?: string;
  };

  const normalizedLoginId = (loginId ?? email ?? '').trim().toLowerCase();

  if (!normalizedLoginId || (!EMAIL_RE.test(normalizedLoginId) && !MOBILE_RE.test(normalizedLoginId))) {
    res.status(400).json({ error: 'A valid email address or mobile number is required.' });
    return;
  }

  if (!encryptedPassword) {
    res.status(400).json({ error: 'Encrypted password is required.' });
    return;
  }

  let incomingPlainPassword = '';
  try {
    incomingPlainPassword = await decryptClientPasswordPayload(encryptedPassword);
  } catch {
    res.status(400).json({ error: 'Unable to decrypt password payload.' });
    return;
  }

  if (incomingPlainPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  // Check if login attempt is with a mobile number and if there are duplicates
  if (MOBILE_RE.test(normalizedLoginId)) {
    const mobileCount = await countUsersByMobileNumber(normalizedLoginId);
    if (mobileCount > 1) {
      res.status(400).json({ error: 'Please login with Email Id' });
      return;
    }
  }

  const user = await findUserByEmailOrMobile(normalizedLoginId);
  if (!user || !user.passwordEncrypted) {
    res.status(401).json({ error: 'Invalid email/mobile number or password.' });
    return;
  }

  if (!['public', 'coach', 'admin'].includes(user.role)) {
    res.status(403).json({ error: 'This account role is not permitted to access the application.' });
    return;
  }

  let storedPlainPassword = '';
  try {
    storedPlainPassword = await decryptPasswordAtRest(user.passwordEncrypted);
  } catch {
    res.status(500).json({ error: 'Unable to verify account password.' });
    return;
  }

  if (storedPlainPassword !== incomingPlainPassword) {
    res.status(401).json({ error: 'Invalid email/mobile number or password.' });
    return;
  }

  const token = jwt.sign({ email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, email: user.email });
});

router.post('/forgot-password/request', async (req, res) => {
  const {
    email,
  } = req.body as {
    email?: string;
  };

  const normalizedEmail = normalizeEmail(email ?? '');

  if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  const existingUser = await findUserByEmail(normalizedEmail);
  if (!existingUser) {
    console.warn(`[auth:forgot-password] Account not found for ${maskEmail(normalizedEmail)}`);
    res.status(404).json({ error: 'No account found for that email address.' });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const saved = await savePasswordResetCode({
    email: normalizedEmail,
    code,
    expiresAtIso: expiresAt,
  });

  if (!saved) {
    console.error(`[auth:forgot-password] Could not save reset code for ${maskEmail(normalizedEmail)}`);
    res.status(500).json({ error: 'Unable to prepare reset passcode. Please try again.' });
    return;
  }

  try {
    await sendPasswordResetPasscode({ email: normalizedEmail, code });
    console.log(`[auth:forgot-password] Reset code email sent to ${maskEmail(normalizedEmail)}`);
  } catch (error) {
    console.error(`[auth:forgot-password] Reset code email failed for ${maskEmail(normalizedEmail)}`, error);
    res.status(500).json({ error: 'Unable to send reset passcode email. Please try again.' });
    return;
  }

  res.json({ message: 'A 6-digit passcode has been sent to your email address.' });
});

router.post('/forgot-password/verify', async (req, res) => {
  const {
    email,
    code,
  } = req.body as {
    email?: string;
    code?: string;
  };

  const normalizedEmail = normalizeEmail(email ?? '');
  const normalizedCode = (code ?? '').trim();

  if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    res.status(400).json({ error: 'Enter a valid 6-digit passcode.' });
    return;
  }

  const matches = await verifyPasswordResetCode({ email: normalizedEmail, code: normalizedCode });
  if (!matches) {
    res.status(400).json({ error: 'The passcode is invalid or has expired.' });
    return;
  }

  res.json({ message: 'Passcode verified successfully.' });
});

router.post('/forgot-password/reset', async (req, res) => {
  const {
    email,
    code,
    encryptedPassword,
  } = req.body as {
    email?: string;
    code?: string;
    encryptedPassword?: string;
  };

  const normalizedEmail = normalizeEmail(email ?? '');
  const normalizedCode = (code ?? '').trim();

  if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    res.status(400).json({ error: 'Enter a valid 6-digit passcode.' });
    return;
  }

  if (!encryptedPassword) {
    res.status(400).json({ error: 'Encrypted password is required.' });
    return;
  }

  let plainPassword = '';
  try {
    plainPassword = await decryptClientPasswordPayload(encryptedPassword);
  } catch {
    res.status(400).json({ error: 'Unable to decrypt password payload.' });
    return;
  }

  if (plainPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const passwordEncrypted = await encryptPasswordAtRest(plainPassword);
  const updatedUser = await completePasswordReset({
    email: normalizedEmail,
    code: normalizedCode,
    passwordEncrypted,
  });

  if (!updatedUser) {
    res.status(400).json({ error: 'Unable to reset password. The passcode may be invalid or expired.' });
    return;
  }

  res.json({ message: 'Password reset successful.' });
});

export default router;
