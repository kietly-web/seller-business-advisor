import { appDb } from '@sa/db';
import { formatInstantDate, formatVnd } from '@sa/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fill, t } from '../../../lib/messages';
import { noIndex } from '../../../lib/site';
import { skuWeekDetail, weekRange } from '../../../server/profit';
import { requireShop } from '../../../server/session';
import { Money, Pct } from '../money';

export const metadata: Metadata = { title: t.profit.title, ...noIndex };

export const dynamic = 'force-dynamic';

export default async function SkuWeekPage({ params, searchParams }: { params: Promise<{ skuId: string }>; searchParams: Promise<{ tuan?: string }> }) {
  const { user, shop } = await requireShop();
  const [{ skuId }, { tuan }] = await Promise.all([params, searchParams]);
  const found = await skuWeekDetail(appDb(), { userId: user.id, shopId: shop.id }, skuId, tuan);
  const back = `/loi-nhuan${found ? `?tuan=${found.week}` : ''}`;
  if (!found || !found.detail.metric) {
    return (
      <main className="stack">
        <h1>{t.profit.title}</h1>
        <p>{t.profit.notFound}</p>
        <Link href={back}>{t.profit.backLink}</Link>
      </main>
    );
  }
  const { week, detail } = found;
  const m = detail.metric;
  const cover = m?.stockCoverDays;
  return (
    <main className="stack">
      <h1>{detail.variation ? `${detail.name} - ${detail.variation}` : detail.name}</h1>
      <p className="muted">{fill(t.profit.detailTitle, { n: weekRange(week).n })}</p>
      {m && (
        <dl className="facts">
          <dt>{t.profit.unitsLabel}</dt><dd>{m.units}</dd>
          <dt>{t.profit.orders}</dt><dd>{m.orders}</dd>
          <dt>{t.profit.grossRevenue}</dt><dd>{formatVnd(m.grossRevenueVnd)}</dd>
          <dt>{t.profit.sellerDiscount}</dt><dd>{formatVnd(m.sellerDiscountVnd)}</dd>
          <dt>{t.profit.netRevenue}</dt><dd>{formatVnd(m.netRevenueVnd)}</dd>
          <dt>{t.profit.fees}</dt><dd>{formatVnd(m.platformFeesVnd)}</dd>
          <dt>{t.profit.cogs}</dt><dd><Money value={m.cogsVnd} /></dd>
          <dt>{t.profit.margin}</dt><dd><Money value={m.contributionMarginVnd} /> <Pct value={m.marginPct} /></dd>
          {m.avgSellingPriceVnd !== null && (<><dt>{t.profit.avgPrice}</dt><dd>{formatVnd(m.avgSellingPriceVnd)}</dd></>)}
          {m.onHand !== null && (
            <>
              <dt>{t.profit.onHand}</dt>
              <dd>
                {m.onHand}
                {cover !== null && cover !== undefined && (
                  <><br /><span className="muted">{cover === Number.POSITIVE_INFINITY ? t.profit.stockCoverNoSales : fill(t.profit.stockCover, { n: Math.round(cover) })}</span></>
                )}
              </dd>
            </>
          )}
        </dl>
      )}
      {m?.cogsVnd === null && <p className="notice"><Link href="/gia-von">{t.profit.enterCosts}</Link></p>}

      <h2>{t.profit.sourceTitle}</h2>
      <p className="muted">{t.profit.sourceNote}</p>
      <table className="data">
        <tbody>
          {detail.lines.map((l) => (
            <tr key={`${l.fileName}-${l.sourceRow}`}>
              <td>
                {fill(t.profit.sourceRow, { file: l.fileName, row: l.sourceRow })}
                <br />
                <span className="muted">{l.completedAt ? fill(t.profit.completedOn, { date: formatInstantDate(l.completedAt) }) : ''}</span>
              </td>
              <td className="num">
                {fill(t.profit.units, { n: l.quantity })}
                <br />
                {formatVnd(l.grossRevenueVnd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail.lines.length >= 500 && <p className="muted">{t.profit.sourceLimit}</p>}
      <Link href={back}>{t.profit.backLink}</Link>
    </main>
  );
}
