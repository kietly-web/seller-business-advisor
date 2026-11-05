import { describe, expect, it } from 'vitest';
import { authErrorMessage, validateCredentials } from './auth-errors';
import { t } from './messages';

describe('authErrorMessage', () => {
  it.each([
    [429, null, t.errors.rateLimited],
    [403, { code: 'EMAIL_NOT_VERIFIED' }, t.errors.emailNotVerified],
    [401, { code: 'INVALID_EMAIL_OR_PASSWORD' }, t.errors.invalidCredentials],
    [400, { code: 'PASSWORD_TOO_SHORT' }, t.errors.passwordTooShort],
    [400, { code: 'SERVICE_CONSENT_REQUIRED' }, t.errors.serviceConsentRequired],
    [400, { message: t.errors.passwordCompromised }, t.errors.passwordCompromised],
    [500, { code: 'SOMETHING_ELSE' }, t.errors.generic],
  ])('maps %s %j to the right Vietnamese message', (status, body, expected) => {
    expect(authErrorMessage(status, body)).toBe(expected);
  });
});

describe('validateCredentials', () => {
  it('flags a bad email and a short password', () => {
    expect(validateCredentials('lan@', 'short')).toEqual({ email: t.errors.invalidEmail, password: t.errors.passwordTooShort });
  });

  it('accepts valid input', () => {
    expect(validateCredentials('lan@example.com', 'long-enough-pass')).toEqual({});
  });
});
