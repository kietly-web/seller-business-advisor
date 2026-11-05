import { appDb } from '@sa/db';
import { asIsoDate, formatDate } from '@sa/shared';
import type { Metadata } from 'next';
import { noIndex } from '../../lib/site';
import Link from 'next/link';
import { t } from '../../lib/messages';
import { recentUploads } from '../../server/ingest';
import { requireShop } from '../../server/session';
import { signOutAction } from '../actions/auth';

export const metadata: Metadata = { title: t.dashboard.title, ...noIndex };

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { user, shop } = await requireShop();
  const uploads = await recentUploads(appDb(), { userId: user.id, shopId: shop.id });
  return (
    <main className="stack">
      <div className="row">
        <h1>{shop.name}</h1>
        {shop.isDemo && <span className="badge">{t.app.demoBadge}</span>}
      </div>
      <p>{t.dashboard.welcome}</p>
      <div className="row">
        <Link href="/tai-len">{t.dashboard.uploadLink}</Link>
        <Link href="/gia-von">{t.dashboard.costsLink}</Link>
      </div>
      <section className="stack">
        <h2>{t.dashboard.uploadsTitle}</h2>
        {uploads.length === 0 ? (
          <p className="muted">{t.dashboard.noUploads}</p>
        ) : (
          <ul>
            {uploads.map((u) => (
              <li key={u.id}>
                {t.upload.types[u.exportType as keyof typeof t.upload.types] ?? u.exportType} · {u.fileName} ·{' '}
                {t.upload.status[u.status as keyof typeof t.upload.status] ?? u.status}
                {u.periodFrom && u.periodTo && ` · ${formatDate(asIsoDate(u.periodFrom))} – ${formatDate(asIsoDate(u.periodTo))}`}
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="row">
        <Link href="/cai-dat">{t.dashboard.settingsLink}</Link>
        <form action={signOutAction}>
          <button type="submit" className="secondary">{t.app.signOut}</button>
        </form>
      </div>
    </main>
  );
}
