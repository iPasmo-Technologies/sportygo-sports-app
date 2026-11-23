import { describe, expect, it } from 'vitest';
import { isValidMobileNumber } from '@/lib/mobileNumber';

describe('isValidMobileNumber', () => {
  it.each(['91234567', '81234567', '+6591234567', '6591234567', '+65 9123 4567', '9123-4567'])('accepts the Singapore number %s', (value) => {
    expect(isValidMobileNumber(value)).toBe(true);
  });

  it.each(['9123456789', '6123456789', '+919123456789', '919123456789', '09123456789', '+91 91234 56789'])('accepts the Indian number %s', (value) => {
    expect(isValidMobileNumber(value)).toBe(true);
  });

  it.each(['00000000', '+6500000000', '0000000000', '61234567', '31234567', '5123456789', '9123456', '912345678', '91234567890', '+449123456789', '9123abcd', ''])(
    'rejects %s',
    (value) => {
      expect(isValidMobileNumber(value)).toBe(false);
    },
  );
});
