import { describe, expect, it } from 'vitest';
import { AuthNotConfiguredError, assertProductionAuthConfig } from './auth-config';

const good = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'https://seller-business-advisor.vercel.app',
  AWS_SES_REGION: 'ap-southeast-1',
  EMAIL_FROM: 'no-reply@example.vn',
};

describe('assertProductionAuthConfig', () => {
  it('accepts a complete production config', () => {
    expect(() => assertProductionAuthConfig(good)).not.toThrow();
  });

  it.each([
    ['a short secret', { BETTER_AUTH_SECRET: 'short' }, 'at least 32 characters'],
    ['an http URL', { BETTER_AUTH_URL: 'http://seller-business-advisor.vercel.app' }, 'must be https'],
    ['no SES config', { AWS_SES_REGION: undefined }, 'AWS_SES_REGION and EMAIL_FROM'],
  ])('rejects %s', (_label, override, message) => {
    expect(() => assertProductionAuthConfig({ ...good, ...override })).toThrow(message);
  });

  it('throws a typed error so public pages can degrade', () => {
    expect(() => assertProductionAuthConfig({ NODE_ENV: 'production' })).toThrow(AuthNotConfiguredError);
  });

  it('does not apply outside production', () => {
    expect(() => assertProductionAuthConfig({ NODE_ENV: 'development' })).not.toThrow();
  });
});
