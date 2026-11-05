import { createHash, randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDb } from '@sa/db/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuth, type Auth } from './auth';
import { CONSENT_POLICY_VERSION, consentTextHash } from './consents';
import type { EmailMessage, EmailSender } from './email';

class CapturingSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
  lastLinkTo(email: string): string {
    const message = [...this.sent].reverse().find((m) => m.to === email);
    const url = message?.text.split('\n').find((line) => line.startsWith('http'));
    if (!url) {
      throw new Error(`No verification link sent to ${email}`);
    }
    return url;
  }
}

const PASSWORD = 'mua-he-o-da-lat-2026';
const TEST_SECRET = randomBytes(32).toString('hex');
type SignUpBody = NonNullable<Parameters<Auth['api']['signUpEmail']>[0]>['body'];
const CONSENTS = { service_processing: true, anonymised_benchmarking: false, marketing: true };

let client: PGlite;
let email: CapturingSender;
let auth: Auth;

beforeAll(async () => {
  const test = await createTestDb();
  client = test.client;
  email = new CapturingSender();
  auth = createAuth({
    db: test.db,
    email,
    baseURL: 'http://localhost:3000',
    secret: TEST_SECRET,
    checkBreachedPasswords: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client.close();
});

async function errorOf(promise: Promise<unknown>): Promise<{ status?: string | number; message?: string } | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as { status?: string | number; message?: string };
  }
}

describe('email sign-up with verification', () => {
  it('stores the user unverified and sends a Vietnamese verification email', async () => {
    await auth.api.signUpEmail({ body: { email: 'lan@example.com', password: PASSWORD, name: 'Chị Lan', consents: CONSENTS } as SignUpBody });
    const { rows } = await client.query<{ email_verified: boolean }>(
      `select email_verified from auth.user where email = 'lan@example.com'`,
    );
    expect(rows).toEqual([{ email_verified: false }]);
    expect(email.sent.at(-1)?.subject).toBe('Xác nhận email cho Seller Advisor');
  });

  it('refuses sign-in until the email is verified', async () => {
    const error = await errorOf(auth.api.signInEmail({ body: { email: 'lan@example.com', password: PASSWORD } }));
    expect(error?.status).toBe('FORBIDDEN');
  });

  it('verifies the email from the emailed link, then allows sign-in', async () => {
    const response = await auth.handler(new Request(email.lastLinkTo('lan@example.com')));
    expect(response.status).toBeLessThan(400);
    const { rows } = await client.query<{ email_verified: boolean }>(
      `select email_verified from auth.user where email = 'lan@example.com'`,
    );
    expect(rows).toEqual([{ email_verified: true }]);
    const signedIn = await auth.api.signInEmail({ body: { email: 'lan@example.com', password: PASSWORD } });
    expect(signedIn.token).toEqual(expect.any(String));
  });

  it('stores a password hash, never the password', async () => {
    const { rows } = await client.query<{ password: string }>(
      `select a.password from auth.account a join auth.user u on u.id = a.user_id where u.email = 'lan@example.com'`,
    );
    expect(rows[0]?.password).toBeTruthy();
    expect(rows[0]?.password).not.toContain(PASSWORD);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const error = await errorOf(
      auth.api.signUpEmail({ body: { email: 'short@example.com', password: 'ngan', name: 'Short', consents: CONSENTS } as SignUpBody }),
    );
    expect(error).not.toBeNull();
  });
});

describe('breached-password check', () => {
  it('rejects a password found in Have I Been Pwned, sending only the hash prefix', async () => {
    const checked = createAuth({
      db: (await createTestDb()).db,
      email: new CapturingSender(),
      baseURL: 'http://localhost:3000',
      secret: TEST_SECRET,
      checkBreachedPasswords: true,
    });
    const sha1 = createHash('sha1').update('password123').digest('hex').toUpperCase();
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        requested.push(url);
        return new Response(`${sha1.slice(5)}:12345\r\n0000000000000000000000000000000000A:1`, { status: 200 });
      }),
    );
    const error = await errorOf(
      checked.api.signUpEmail({ body: { email: 'pwned@example.com', password: 'password123', name: 'P', consents: CONSENTS } as SignUpBody }),
    );
    expect(error?.message).toContain('Mật khẩu này đã xuất hiện');
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain(`/range/${sha1.slice(0, 5)}`);
    expect(requested[0]).not.toContain(sha1.slice(5));
  });
});

describe('two-factor authentication', () => {
  it('lets a signed-in user start TOTP enrolment', async () => {
    const response = await auth.api.signInEmail({
      body: { email: 'lan@example.com', password: PASSWORD },
      asResponse: true,
    });
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toBeTruthy();
    const enrolment = await auth.api.enableTwoFactor({
      body: { password: PASSWORD },
      headers: new Headers({ cookie: cookie ?? '' }),
    });
    if (enrolment.method !== 'totp') {
      throw new Error(`Expected TOTP enrolment, got ${enrolment.method}`);
    }
    expect(enrolment.totpURI).toMatch(/^otpauth:\/\/totp\/Seller%20Advisor/);
    expect(enrolment.backupCodes.length).toBeGreaterThan(0);
  });
});

describe('abuse protections', () => {
  it('answers a duplicate sign-up like a new one and emails the existing owner instead', async () => {
    const before = email.sent.length;
    const result = await auth.api.signUpEmail({
      body: { email: 'lan@example.com', password: 'another-long-password-2026', name: 'Someone', consents: CONSENTS } as SignUpBody,
    });
    expect(result.user.email).toBe('lan@example.com');
    expect(email.sent.slice(before).map((m) => m.subject)).toEqual(['Bạn đã có tài khoản Seller Advisor']);
  });

  it('caps a session at 14 days with no sliding refresh', async () => {
    const { rows } = await client.query<{ days: number }>(
      `select round(extract(epoch from s.expires_at - s.created_at) / 86400)::int as days
       from auth.session s join auth.user u on u.id = s.user_id where u.email = 'lan@example.com' limit 1`,
    );
    expect(rows[0]?.days).toBe(14);
  });

  it('rate-limits password sign-in per client IP, stored in the database', async () => {
    const attempt = () =>
      auth.handler(
        new Request('http://localhost:3000/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7', origin: 'http://localhost:3000' },
          body: JSON.stringify({ email: 'lan@example.com', password: 'wrong-password-123' }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await attempt()).status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
    const { rows } = await client.query<{ n: number }>(`select count(*)::int as n from auth.rate_limit`);
    expect(rows[0]?.n).toBeGreaterThan(0);
  });
});

describe('consents at sign-up', () => {
  it('refuses sign-up without the required service consent', async () => {
    const error = await errorOf(
      auth.api.signUpEmail({
        body: { email: 'noconsent@example.com', password: PASSWORD, name: 'N', consents: { ...CONSENTS, service_processing: false } } as SignUpBody,
      }),
    );
    expect((error as { body?: { code?: string } } | null)?.body?.code).toBe('SERVICE_CONSENT_REQUIRED');
    const { rows } = await client.query(`select id from auth.user where email = 'noconsent@example.com'`);
    expect(rows).toEqual([]);
  });

  it('records each choice with the policy version and the hash of the text shown', async () => {
    const { rows } = await client.query<{ purpose: string; granted: boolean; policy_version: string; ui_text_hash: string }>(
      `select c.purpose, c.granted, c.policy_version, c.ui_text_hash from app.consent_record c
       join auth.user u on u.id = c.user_id where u.email = 'lan@example.com' order by c.purpose`,
    );
    expect(rows.map((r) => [r.purpose, r.granted])).toEqual([
      ['anonymised_benchmarking', false],
      ['marketing', true],
      ['service_processing', true],
    ]);
    expect(new Set(rows.map((r) => r.policy_version))).toEqual(new Set([CONSENT_POLICY_VERSION]));
    expect(rows[0]?.ui_text_hash).toBe(consentTextHash());
  });

  it('records no consents for a duplicate sign-up', async () => {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from app.consent_record c join auth.user u on u.id = c.user_id where u.email = 'lan@example.com'`,
    );
    expect(rows[0]?.n).toBe(3);
  });
});
