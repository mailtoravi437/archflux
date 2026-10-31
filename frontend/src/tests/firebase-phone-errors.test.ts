import { describe, expect, it } from 'vitest';
import { phoneAuthErrorMessage } from '../lib/firebasePhone';

describe('phoneAuthErrorMessage', () => {
  it.each([
    ['auth/invalid-phone-number', 'That phone number is not valid. Use the international format, for example +919876543210.'],
    ['auth/invalid-verification-code', 'That code is not correct. Check the SMS and try again.'],
    ['auth/code-expired', 'That code has expired. Go back and send a new one.'],
  ])('%s maps to its message', (code, msg) => {
    expect(phoneAuthErrorMessage(Object.assign(new Error('x'), { code }))).toBe(msg);
  });
  it('falls back honestly for unknown errors and non-errors', () => {
    expect(phoneAuthErrorMessage(new Error('boom'))).toBe('Phone sign-in failed: boom');
    expect(phoneAuthErrorMessage(null)).toBe('Phone sign-in failed.');
  });
});
