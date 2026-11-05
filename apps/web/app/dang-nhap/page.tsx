import Link from 'next/link';
import { t } from '../../lib/messages';
import { SignInForm } from './sign-in-form';

export default function SignInPage() {
  return (
    <main>
      <h1>{t.signIn.title}</h1>
      <SignInForm />
      <p className="muted">
        {t.signIn.noAccount} <Link href="/dang-ky">{t.signIn.signUpLink}</Link>
      </p>
    </main>
  );
}
