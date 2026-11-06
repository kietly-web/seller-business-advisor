export class AuthNotConfiguredError extends Error {
  override readonly name = 'AuthNotConfiguredError';
}

export interface AuthMethods {
  emailPassword: boolean;
  google: boolean;
}

// Email + password needs a way to send verification emails; outside local development that means SES
export function authMethodsFromEnv(env: Record<string, string | undefined>): AuthMethods {
  // Only presence is read here, so pages can use this; the secret itself is read in server-only auth-instance.ts
  return {
    emailPassword: Boolean(env.AWS_SES_REGION && env.EMAIL_FROM) || env.NODE_ENV !== 'production',
    google: Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()),
  };
}

export function assertProductionAuthConfig(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  if ((env.BETTER_AUTH_SECRET ?? '').length < 32) {
    throw new AuthNotConfiguredError('BETTER_AUTH_SECRET must be at least 32 characters in production');
  }
  if (!(env.BETTER_AUTH_URL ?? '').startsWith('https://')) {
    throw new AuthNotConfiguredError('BETTER_AUTH_URL must be https in production');
  }
  const methods = authMethodsFromEnv(env);
  if (!methods.emailPassword && !methods.google) {
    throw new AuthNotConfiguredError('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or AWS_SES_REGION and EMAIL_FROM, in production');
  }
}
