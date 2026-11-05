import { appDb } from '@sa/db';
import { formatDate, formatVnd } from '@sa/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fill, t } from '../../lib/messages';
import { noIndex } from '../../lib/site';
import { weekProfit, weekRange } from '../../server/profit';
import { requireShop } from '../../server/session';
import { Money, Pct } from './money';

export const metadata: Metadata = { title: t.profit.title, ...noIndex };

export const dynamic = 'force-dynamic';

function weekLabel(week: Parameters<typeof weekRange>[0]): string {
  const { from, to, n } = weekRange(week);
  return fill(t.profit.weekOption, { n, from: formatDate(from).slice(0, 5), to: formatDate(to) });
}

export default async function ProfitPage({ searchParams }: { searchParams: Promise<{ tuan?: string }> }) {
  const { user, shop } = await requireShop();
  const { tuan } = await searchParams;
  const { weeks, week, rows, totals, unallocatedFeesVnd } = await weekProfit(appDb(), { userId: user.id, shopId: shop.id }, tuan, new Date());

  return (
    <main className="stack">
      <h1>{t.profit.title}</h1>
      <p className="muted">{t.profit.intro}</p>
      {!week ? (
        <p>{t.profit.empty} <Link href="/tai-len">{t.dashboard.uploadLink}</Link></p>
      ) : (
        <>
          <form className="week-form" method="get">
            <label>
              {t.profit.weekLabel}
              <select name="tuan" defaultValue={week}>
                {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
              </select>
            </label>
            <button type="submit" className="secondary">{t.profit.show}</button>
          </form>

          <dl className="facts">
            <dt>{t.profit.netRevenue}</dt><dd>{formatVnd(totals.netRevenueVnd)}</dd>
            <dt>{t.profit.fees}</dt><dd>{formatVnd(totals.platformFeesVnd)}</dd>
            <dt>{t.profit.cogs}</dt><dd>{formatVnd(totals.cogsVnd)}</dd>
            <dt>{t.profit.margin}</dt><dd><Money value={totals.contributionMarginVnd} /> <Pct value={totals.marginPct} /></dd>
          </dl>
          {totals.missingCost > 0 && (
            <p className="notice">
              {fill(t.profit.costMissingNote, { n: totals.missingCost })} <Link href="/gia-von">{t.profit.enterCosts}</Link>
            </p>
          )}
          {totals.platformFeesVnd === 0n && totals.netRevenueVnd > 0n && <p className="notice">{t.profit.noIncome}</p>}
          {unallocatedFeesVnd > 0n && <p className="muted">{fill(t.profit.unallocatedFees, { amount: formatVnd(unallocatedFeesVnd) })}</p>}

          <table className="data">
            <caption className="muted">{weekLabel(week)}</caption>
            <thead>
              <tr>
                <th scope="col">{t.profit.product}</th>
                <th scope="col" className="num">{t.profit.netRevenue}</th>
                <th scope="col" className="num">{t.profit.margin}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.skuId}>
                  <td>
                    <Link href={`/loi-nhuan/${r.skuId}?tuan=${week}`}>{r.variation ? `${r.name} - ${r.variation}` : r.name}</Link>
                    <br />
                    <span className="muted">{fill(t.profit.units, { n: r.units })}</span>
                  </td>
                  <td className="num">{formatVnd(r.netRevenueVnd)}</td>
                  <td className="num">
                    <Money value={r.contributionMarginVnd} />
                    <br />
                    <Pct value={r.marginPct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <Link href="/tong-quan">{t.profit.dashboardLink}</Link>
    </main>
  );
}
