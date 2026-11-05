import type { Metadata } from 'next';
import { noIndex } from '../../lib/site';
import Link from 'next/link';
import { t } from '../../lib/messages';

export const metadata: Metadata = { title: t.checkEmail.title, ...noIndex };

export default function CheckEmailPage() {
  return (
    <main className="stack">
      <h1>{t.checkEmail.title}</h1>
      <p>{t.checkEmail.body}</p>
      <Link href="/dang-nhap">{t.checkEmail.signInLink}</Link>
    </main>
  );
}
