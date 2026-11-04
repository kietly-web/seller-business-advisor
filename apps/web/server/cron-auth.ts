import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
