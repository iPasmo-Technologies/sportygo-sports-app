import { describe, expect, it } from 'vitest';
import { mobileLookupValues, normalizeMobileNumber } from './mobileNumber';

describe('normalizeMobileNumber', () => {
  it.each([
    ['91234567', '+6591234567'],
    ['81234567', '+6581234567'],
    ['+6591234567', '+6591234567'],
    ['6591234567', '+6591234567'],
    [' +65 9123 4567 ', '+6591234567'],
    ['9123-4567', '+6591234567'],
  ])('accepts the Singapore number %s as %s', (input, expected) => {
    expect(normalizeMobileNumber(input)).toBe(expected);
  });

  it.each([
    ['9123456789', '+919123456789'],
    ['6123456789', '+916123456789'],
    ['+919123456789', '+919123456789'],
    ['919123456789', '+919123456789'],
    ['09123456789', '+919123456789'],
    ['+91 91234 56789', '+919123456789'],
  ])('accepts the Indian number %s as %s', (input, expected) => {
    expect(normalizeMobileNumber(input)).toBe(expected);
  });

  // "65" + 8 digits is also 10 digits starting with 6; this is a Singapore app, so Singapore wins.
  // An Indian user with such a number types +91 first.
  it('reads an ambiguous 65-prefixed number as Singapore', () => {
    expect(normalizeMobileNumber('6591234567')).toBe('+6591234567');
    expect(normalizeMobileNumber('+916591234567')).toBe('+916591234567');
  });

  it.each([
    ['all zeros', '00000000'],
    ['the signup placeholder', '+6500000000'],
    ['ten zeros', '0000000000'],
    ['a Singapore landline', '61234567'],
    ['a number starting with 3', '31234567'],
    ['an Indian number starting with 5', '5123456789'],
    ['too short', '9123456'],
    ['nine digits', '912345678'],
    ['eleven digits', '91234567890'],
    ['another country code', '+449123456789'],
    ['letters', '9123abcd'],
    ['empty', ''],
  ])('rejects %s', (_label, input) => {
    expect(normalizeMobileNumber(input)).toBeNull();
  });
});

describe('mobileLookupValues', () => {
  it('matches every way a Singapore number may have been saved before', () => {
    expect(mobileLookupValues('91234567').sort()).toEqual(['+6591234567', '6591234567', '91234567']);
    expect(mobileLookupValues('+6591234567').sort()).toEqual(['+6591234567', '6591234567', '91234567']);
  });

  it('matches every way an Indian number may have been saved before', () => {
    expect(mobileLookupValues('9123456789').sort()).toEqual(['+919123456789', '09123456789', '9123456789', '919123456789']);
  });

  it('keeps any other value exactly as typed, so older accounts can still log in', () => {
    expect(mobileLookupValues(' +449123456789 ')).toEqual(['+449123456789']);
  });
});
