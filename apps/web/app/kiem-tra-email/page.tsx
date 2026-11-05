import Link from 'next/link';
import { t } from '../../lib/messages';

export default function CheckEmailPage() {
  return (
    <main className="stack">
      <h1>{t.checkEmail.title}</h1>
      <p>{t.checkEmail.body}</p>
      <Link href="/dang-nhap">{t.checkEmail.signInLink}</Link>
    </main>
  );
}
