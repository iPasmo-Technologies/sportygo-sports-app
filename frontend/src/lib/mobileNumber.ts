// Same rule as backend/src/lib/mobileNumber.ts:
// Singapore: 8 digits starting with 8 or 9, optional 65 / +65.
// India: 10 digits starting with 6 to 9, optional 91 / +91 or a leading 0.
// The server is the real check (and saves +65XXXXXXXX / +91XXXXXXXXXX); this only gives early feedback.
const SG_MOBILE_RE = /^(?:\+?65)?[89]\d{7}$/;
const IN_MOBILE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;

export const MOBILE_ERROR = 'Enter a valid Singapore mobile (8 digits, starting with 8 or 9) or Indian mobile (10 digits, starting with 6 to 9).';

export function isValidMobileNumber(value: string): boolean {
  const compact = value.replace(/[\s-]/g, '');
  return SG_MOBILE_RE.test(compact) || IN_MOBILE_RE.test(compact);
}
