import { account, rateLimit, session, twoFactor as twoFactorTable, user, verification, type Db } from '@sa/db';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { haveIBeenPwned } from 'better-auth/plugins/haveibeenpwned';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { parseConsentChoices, recordSignUpConsents } from './consents';
import { existingAccountEmail, verificationEmail, type EmailSender } from './email';

const DAY = 60 * 60 * 24;

export interface AuthDeps {
  db: Db;
  email: EmailSender;
  baseURL: string;
  secret: string;
  checkBreachedPasswords: boolean;
}

export function createAuth(deps: AuthDeps) {
  return betterAuth({
    appName: 'Seller Advisor',
    baseURL: deps.baseURL,
    secret: deps.secret,
    database: drizzleAdapter(deps.db, {
      provider: 'pg',
      schema: { user, session, account, verification, twoFactor: twoFactorTable, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false,
      onExistingUserSignUp: async ({ user: existing }) => {
        await deps.email.send(existingAccountEmail(existing.email, `${deps.baseURL}/dang-nhap`));
      },
    },
    session: {
      expiresIn: 14 * DAY,
      disableSessionRefresh: true,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
        '/send-verification-email': { window: 300, max: 3 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user: u, url }) => {
        await deps.email.send(verificationEmail(u.email, url));
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') {
          return;
        }
        const choices = parseConsentChoices((ctx.body as Record<string, unknown> | undefined)?.consents);
        if (!choices?.service_processing) {
          throw new APIError('BAD_REQUEST', { code: 'SERVICE_CONSENT_REQUIRED', message: 'Service consent is required' });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created, context) => {
            const choices = parseConsentChoices((context?.body as Record<string, unknown> | undefined)?.consents);
            if (choices) {
              await recordSignUpConsents(deps.db, created.id, choices, context?.request?.headers.get('user-agent') ?? null);
            }
          },
        },
      },
    },
    plugins: [
      twoFactor({ issuer: 'Seller Advisor' }),
      haveIBeenPwned({
        enabled: deps.checkBreachedPasswords,
        customPasswordCompromisedMessage:
          'Mật khẩu này đã xuất hiện trong các vụ lộ dữ liệu. Vui lòng chọn mật khẩu khác.',
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
