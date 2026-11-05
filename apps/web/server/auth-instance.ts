import 'server-only';
import { appDb } from '@sa/db';
import { createAuth, type Auth } from './auth';
import { createEmailSender } from './email';

let instance: Auth | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function getAuth(): Auth {
  instance ??= createAuth({
    db: appDb(),
    email: createEmailSender(process.env),
    baseURL: requireEnv('BETTER_AUTH_URL'),
    secret: requireEnv('BETTER_AUTH_SECRET'),
    checkBreachedPasswords: true,
  });
  return instance;
}
