import { t } from './messages';

export function authErrorMessage(status: number, body: { code?: string; message?: string } | null): string {
  const code = body?.code ?? '';
  if (status === 429) return t.errors.rateLimited;
  if (code === 'EMAIL_NOT_VERIFIED') return t.errors.emailNotVerified;
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || status === 401) return t.errors.invalidCredentials;
  if (code === 'PASSWORD_TOO_SHORT') return t.errors.passwordTooShort;
  if (code === 'PASSWORD_TOO_LONG') return t.errors.passwordTooLong;
  if (code === 'SERVICE_CONSENT_REQUIRED') return t.errors.serviceConsentRequired;
  if (code.includes('COMPROMISED') || body?.message === t.errors.passwordCompromised) return t.errors.passwordCompromised;
  if (code === 'INVALID_EMAIL') return t.errors.invalidEmail;
  return t.errors.generic;
}

export function validateCredentials(email: string, password: string): Partial<Record<'email' | 'password', string>> {
  const errors: Partial<Record<'email' | 'password', string>> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = t.errors.invalidEmail;
  if (password.length < 8) errors.password = t.errors.passwordTooShort;
  else if (password.length > 128) errors.password = t.errors.passwordTooLong;
  return errors;
}
