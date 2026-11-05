'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authErrorMessage, validateCredentials } from '../../lib/auth-errors';
import { t } from '../../lib/messages';

type Errors = Partial<Record<'name' | 'email' | 'password' | 'service', string>>;

export function SignUpForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const consents = {
      service_processing: form.get('service_processing') === 'on',
      anonymised_benchmarking: form.get('anonymised_benchmarking') === 'on',
      marketing: form.get('marketing') === 'on',
    };
    const next: Errors = { ...validateCredentials(email, password) };
    if (!name) next.name = t.errors.required;
    if (!consents.service_processing) next.service = t.errors.serviceConsentRequired;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    try {
      const res = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password, callbackURL: '/bat-dau', consents }),
      });
      if (res.ok) {
        router.push('/kiem-tra-email');
        return;
      }
      setFormError(authErrorMessage(res.status, await res.json().catch(() => null)));
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
        {t.signUp.name}
        <input type="text" name="name" autoComplete="name" required aria-invalid={!!errors.name} aria-describedby="name-error" />
        {errors.name && <span id="name-error" className="field-error">{errors.name}</span>}
      </label>
      <label>
        {t.signUp.email}
        <input type="email" name="email" autoComplete="email" required aria-invalid={!!errors.email} aria-describedby="email-error" />
        {errors.email && <span id="email-error" className="field-error">{errors.email}</span>}
      </label>
      <label>
        {t.signUp.password}
        <input type="password" name="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-invalid={!!errors.password} aria-describedby="password-hint password-error" />
        <span id="password-hint" className="muted">{t.signUp.passwordHint}</span>
        {errors.password && <span id="password-error" className="field-error">{errors.password}</span>}
      </label>
      <fieldset aria-describedby="consents-hint">
        <legend>{t.signUp.consentsLegend}</legend>
        <p id="consents-hint" className="muted">{t.signUp.consentsHint}</p>
        <label className="check">
          <input type="checkbox" name="service_processing" required aria-invalid={!!errors.service} aria-describedby="service-error" />
          <span>{t.consents.service_processing}</span>
        </label>
        {errors.service && <span id="service-error" className="field-error">{errors.service}</span>}
        <label className="check">
          <input type="checkbox" name="anonymised_benchmarking" />
          <span>{t.consents.anonymised_benchmarking}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="marketing" />
          <span>{t.consents.marketing}</span>
        </label>
      </fieldset>
      <button type="submit" disabled={pending}>{t.signUp.submit}</button>
    </form>
  );
}
