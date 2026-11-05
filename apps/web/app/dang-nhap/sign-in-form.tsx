'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authErrorMessage } from '../../lib/auth-errors';
import { t } from '../../lib/messages';

export function SignInForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (!email || !password) {
      setFormError(t.errors.invalidCredentials);
      return;
    }
    setFormError(null);
    setPending(true);
    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.twoFactorRedirect) {
        setFormError(t.errors.twoFactorNotSupported);
      } else if (res.ok) {
        router.push('/bat-dau');
        router.refresh();
      } else {
        setFormError(authErrorMessage(res.status, body));
      }
    } catch {
      setFormError(t.errors.generic);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <label>
        {t.signIn.email}
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label>
        {t.signIn.password}
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      <button type="submit" disabled={pending}>{t.signIn.submit}</button>
    </form>
  );
}
