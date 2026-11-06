import type { Metadata } from 'next';
import Link from 'next/link';
import { t } from '../../lib/messages';
import { authMethodsFromEnv } from '../../server/auth-config';
import { GoogleButton } from '../components/google-button';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: t.signIn.title };

export const dynamic = 'force-dynamic';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const methods = authMethodsFromEnv(process.env);
  return (
    <main className="stack">
      <h1>{t.signIn.title}</h1>
      {error && <p className="form-error" role="alert">{error === 'account_not_linked' ? t.signIn.accountNotLinked : t.signIn.googleError}</p>}
      {methods.google && <GoogleButton />}
      {methods.google && methods.emailPassword && <p className="muted">{t.signIn.or}</p>}
      {methods.emailPassword && <SignInForm />}
      {methods.emailPassword && (
        <p className="muted">
          {t.signIn.noAccount} <Link href="/dang-ky">{t.signIn.signUpLink}</Link>
        </p>
      )}
    </main>
  );
}
