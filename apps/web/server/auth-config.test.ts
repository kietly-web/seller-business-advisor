import { describe, expect, it } from 'vitest';
import { AuthNotConfiguredError, assertProductionAuthConfig, authMethodsFromEnv } from './auth-config';

const base = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'https://seller-business-advisor.vercel.app',
};
const ses = { AWS_SES_REGION: 'ap-southeast-1', EMAIL_FROM: 'no-reply@example.vn' };
const google = { GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret' };

describe('assertProductionAuthConfig', () => {
  it.each([
    ['email only', ses],
    ['Google only', google],
    ['both', { ...ses, ...google }],
  ])('accepts %s', (_label, methods) => {
    expect(() => assertProductionAuthConfig({ ...base, ...methods })).not.toThrow();
  });

  it.each([
    ['a short secret', { ...ses, BETTER_AUTH_SECRET: 'short' }, 'at least 32 characters'],
    ['an http URL', { ...ses, BETTER_AUTH_URL: 'http://seller-business-advisor.vercel.app' }, 'must be https'],
    ['no sign-in method', {}, 'GOOGLE_CLIENT_ID'],
    ['half a Google config', { GOOGLE_CLIENT_ID: 'id' }, 'GOOGLE_CLIENT_ID'],
  ])('rejects %s', (_label, override, message) => {
    expect(() => assertProductionAuthConfig({ ...base, ...override })).toThrow(message);
  });

  it('throws a typed error so public pages can degrade', () => {
    expect(() => assertProductionAuthConfig({ NODE_ENV: 'production' })).toThrow(AuthNotConfiguredError);
  });

  it('does not apply outside production', () => {
    expect(() => assertProductionAuthConfig({ NODE_ENV: 'development' })).not.toThrow();
  });
});

describe('authMethodsFromEnv', () => {
  it('offers email and password in production only with SES, and Google only with both keys', () => {
    expect(authMethodsFromEnv({ ...base, ...google })).toEqual({ emailPassword: false, google: true });
    expect(authMethodsFromEnv({ ...base, ...ses })).toEqual({ emailPassword: true, google: false });
    expect(JSON.stringify(authMethodsFromEnv({ ...base, ...google }))).not.toContain('secret');
    expect(authMethodsFromEnv({ NODE_ENV: 'development' }).emailPassword).toBe(true);
  });
});
