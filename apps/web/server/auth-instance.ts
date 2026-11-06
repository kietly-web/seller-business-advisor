import 'server-only';
import { appDb } from '@sa/db';
import { createAuth, type Auth } from './auth';
import { AuthNotConfiguredError, assertProductionAuthConfig, authMethodsFromEnv } from './auth-config';
import { createEmailSender } from './email';

let instance: Auth | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AuthNotConfiguredError(`${name} is not set`);
  }
  return value;
}

export function getAuth(): Auth {
  assertProductionAuthConfig(process.env);
  instance ??= createAuth({
    db: appDb(),
    email: createEmailSender(process.env),
    baseURL: requireEnv('BETTER_AUTH_URL'),
    secret: requireEnv('BETTER_AUTH_SECRET'),
    checkBreachedPasswords: true,
    emailPassword: authMethodsFromEnv(process.env).emailPassword,
    google: googleCredentials(),
  });
  return instance;
}

function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
