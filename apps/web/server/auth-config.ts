export class AuthNotConfiguredError extends Error {
  override readonly name = 'AuthNotConfiguredError';
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
  if (!env.AWS_SES_REGION || !env.EMAIL_FROM) {
    throw new AuthNotConfiguredError('AWS_SES_REGION and EMAIL_FROM must be set in production');
  }
}
