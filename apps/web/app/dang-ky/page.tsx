import type { Metadata } from 'next';
import Link from 'next/link';
import { t } from '../../lib/messages';
import { authMethodsFromEnv } from '../../server/auth-config';
import { GoogleButton } from '../components/google-button';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: t.signUp.title };

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  const methods = authMethodsFromEnv(process.env);
  return (
    <main className="stack">
      <h1>{t.signUp.title}</h1>
      {methods.google && (
        <>
          <GoogleButton />
          <p className="muted">{t.signUp.googleConsentNote}</p>
        </>
      )}
      {methods.google && methods.emailPassword && <p className="muted">{t.signIn.or}</p>}
      {methods.emailPassword && <SignUpForm />}
      <p className="muted">
        {t.signUp.haveAccount} <Link href="/dang-nhap">{t.signUp.signInLink}</Link>
      </p>
    </main>
  );
}
