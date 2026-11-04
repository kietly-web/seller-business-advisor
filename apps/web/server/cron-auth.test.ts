import { describe, expect, it } from 'vitest';
import { isAuthorizedCron } from './cron-auth';

describe('isAuthorizedCron', () => {
  it('accepts the exact bearer secret', () => {
    expect(isAuthorizedCron('Bearer s3cret', 's3cret')).toBe(true);
  });

  it.each([
    ['wrong secret', 'Bearer nope', 's3cret'],
    ['missing header', null, 's3cret'],
    ['no Bearer prefix', 's3cret', 's3cret'],
    ['secret not configured', 'Bearer ', undefined],
    ['empty secret configured', 'Bearer ', ''],
  ])('rejects %s', (_label, header, secret) => {
    expect(isAuthorizedCron(header, secret)).toBe(false);
  });
});
