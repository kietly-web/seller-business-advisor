import { account, session, twoFactor as twoFactorTable, user, verification, type Db } from '@sa/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { haveIBeenPwned } from 'better-auth/plugins/haveibeenpwned';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { verificationEmail, type EmailSender } from './email';

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
      schema: { user, session, account, verification, twoFactor: twoFactorTable },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user: u, url }) => {
        await deps.email.send(verificationEmail(u.email, url));
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
