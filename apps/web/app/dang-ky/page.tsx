import type { Metadata } from 'next';
import Link from 'next/link';
import { t } from '../../lib/messages';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: t.signUp.title };

export default function SignUpPage() {
  return (
    <main>
      <h1>{t.signUp.title}</h1>
      <SignUpForm />
      <p className="muted">
        {t.signUp.haveAccount} <Link href="/dang-nhap">{t.signUp.signInLink}</Link>
      </p>
    </main>
  );
}
