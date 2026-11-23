// Accepted mobiles. Spaces and hyphens are allowed while typing, e.g. "+65 9123 4567".
// Singapore: 8 digits starting with 8 or 9, with an optional 65 / +65 country code.
// India: 10 digits starting with 6 to 9, with an optional 91 / +91 country code or a leading 0.
// Singapore is checked first, so "6591234567" (valid both ways) is read as Singapore.
const SG_MOBILE_RE = /^(?:\+?65)?([89]\d{7})$/;
const IN_MOBILE_RE = /^(?:\+?91|0)?([6-9]\d{9})$/;

export const MOBILE_ERROR = 'Enter a valid Singapore mobile (8 digits, starting with 8 or 9) or Indian mobile (10 digits, starting with 6 to 9).';

type ParsedMobile = { countryCode: '65' | '91'; local: string };

function parseMobile(raw: string): ParsedMobile | null {
  const compact = raw.replace(/[\s-]/g, '');
  const sg = SG_MOBILE_RE.exec(compact);
  if (sg) return { countryCode: '65', local: sg[1] };
  const india = IN_MOBILE_RE.exec(compact);
  return india ? { countryCode: '91', local: india[1] } : null;
}

// Returns the number in one standard form (+65XXXXXXXX or +91XXXXXXXXXX), or null when it is not accepted.
export function normalizeMobileNumber(raw: string): string | null {
  const parsed = parseMobile(raw);
  return parsed ? `+${parsed.countryCode}${parsed.local}` : null;
}

// Older accounts stored the number exactly as typed, so login must try every form the number
// may have been saved in. Anything else is matched as typed.
export function mobileLookupValues(loginId: string): string[] {
  const parsed = parseMobile(loginId);
  if (!parsed) return [loginId.trim()];
  const { countryCode, local } = parsed;
  const values = [`+${countryCode}${local}`, `${countryCode}${local}`, local];
  return countryCode === '91' ? [...values, `0${local}`] : values;
}
