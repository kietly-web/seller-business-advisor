import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../lib/messages';
import { getSessionUser } from '../server/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  if (await getSessionUser()) {
    redirect('/tong-quan');
  }
  return (
    <main className="stack">
      <h1>{t.app.name}</h1>
      <p>{t.app.tagline}</p>
      <div className="row">
        <Link className="button" href="/dang-ky">{t.home.signUp}</Link>
        <Link className="button secondary" href="/dang-nhap">{t.home.signIn}</Link>
      </div>
    </main>
  );
}
