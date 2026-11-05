import { appDb, latestRun, withShopContext } from '@sa/db';
import { asIsoWeek, asUserId, formatDate, weekEnd, weekStart } from '@sa/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fill, t } from '../../lib/messages';
import { noIndex } from '../../lib/site';
import { requireShop } from '../../server/session';
import { ActionCard } from './card';
import { RefreshButton } from './refresh-button';

export const metadata: Metadata = { title: t.actions.title, ...noIndex };

export const dynamic = 'force-dynamic';

interface RunNotes {
  weeksOfHistory?: number;
  skipped?: string[];
  missingCosts?: { skuId: string; skuName: string }[];
}

export default async function ActionsPage() {
  const { user, shop } = await requireShop();
  const run = await withShopContext(appDb(), { role: 'sa_app', shopId: shop.id, userId: asUserId(user.id) }, (tx) => latestRun(tx, shop.id));
  const notes = (run?.notes ?? {}) as RunNotes;
  const week = run ? asIsoWeek(run.isoWeek) : null;
  const cards = run?.cards.filter((c) => c.status !== 'expired') ?? [];
  const nudges = (notes.skipped ?? []).filter((s): s is keyof typeof t.actions.nudges => Object.hasOwn(t.actions.nudges, s) && t.actions.nudges[s as keyof typeof t.actions.nudges] !== '');

  return (
    <main className="stack">
      <h1>{t.actions.title}</h1>
      <p className="muted">{t.actions.intro}</p>
      {week && <p className="muted">{fill(t.actions.weekOf, { n: Number(week.slice(6)), from: formatDate(weekStart(week)), to: formatDate(weekEnd(week)) })}</p>}
      <RefreshButton />

      {!run && <p>{t.actions.none}</p>}
      {run?.status === 'insufficient_data' && (
        <p className="notice">
          {fill(t.actions.insufficient, { n: notes.weeksOfHistory ?? 0 })} <Link href="/tai-len">{t.actions.uploadMore}</Link>
        </p>
      )}
      {run?.status === 'succeeded' && cards.length === 0 && <p>{t.actions.empty}</p>}

      {(notes.missingCosts ?? []).length > 0 && (
        <div className="notice stack">
          <p>{t.actions.missingCosts}</p>
          <ul>{(notes.missingCosts ?? []).slice(0, 5).map((m) => <li key={m.skuId}>{m.skuName}</li>)}</ul>
          <Link href="/gia-von">{t.actions.enterCosts}</Link>
        </div>
      )}

      {cards.map((card) => <ActionCard key={card.id} card={card} />)}

      {nudges.length > 0 && (
        <ul className="muted">
          {nudges.map((n) => (
            <li key={n}>
              {t.actions.nudges[n]}{' '}
              {n === 'no_stock_data' && <a href="/mau/ton-kho" download>{t.actions.stockTemplate}</a>}
              {n === 'no_competitor_data' && <Link href="/doi-thu">{t.actions.addCompetitors}</Link>}
            </li>
          ))}
        </ul>
      )}
      <Link href="/tong-quan">{t.actions.dashboardLink}</Link>
    </main>
  );
}
