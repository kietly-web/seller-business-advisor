import type { Metadata } from 'next';
import { noIndex } from '../../lib/site';
import Link from 'next/link';
import { t } from '../../lib/messages';
import { requireShop } from '../../server/session';
import { signOutAction } from '../actions/auth';

export const metadata: Metadata = { title: t.dashboard.title, ...noIndex };

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { shop } = await requireShop();
  return (
    <main className="stack">
      <div className="row">
        <h1>{shop.name}</h1>
        {shop.isDemo && <span className="badge">{t.app.demoBadge}</span>}
      </div>
      <p>{t.dashboard.welcome}</p>
      <div className="row">
        <Link href="/cai-dat">{t.dashboard.settingsLink}</Link>
        <form action={signOutAction}>
          <button type="submit" className="secondary">{t.app.signOut}</button>
        </form>
      </div>
    </main>
  );
}
