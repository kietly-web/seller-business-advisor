import { appDb, listCompetitorListings, listSkuOptions, withShopContext } from '@sa/db';
import { competitorMedian } from '@sa/engine';
import { addDays, asIsoDate, asUserId, formatDate, formatVnd, toIctDate } from '@sa/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fill, t } from '../../lib/messages';
import { noIndex } from '../../lib/site';
import { requireShop } from '../../server/session';
import { ListingForm, ObservationForm } from './forms';

export const metadata: Metadata = { title: t.competitors.title, ...noIndex };

export const dynamic = 'force-dynamic';

export default async function CompetitorsPage() {
  const { user, shop } = await requireShop();
  const today = toIctDate(new Date());
  const { listings, skus } = await withShopContext(appDb(), { role: 'sa_app', shopId: shop.id, userId: asUserId(user.id) }, async (tx) => ({
    listings: await listCompetitorListings(tx, shop.id),
    skus: await listSkuOptions(tx, shop.id),
  }));
  const groups = new Map<string, typeof listings>();
  for (const l of listings) groups.set(l.skuId, [...(groups.get(l.skuId) ?? []), l]);
  const recentFrom = addDays(today, -13);

  return (
    <main className="stack">
      <h1>{t.competitors.title}</h1>
      <p className="muted">{t.competitors.intro}</p>
      {skus.length === 0 ? (
        <p>{t.competitors.noSkus} <Link href="/tai-len">{t.dashboard.uploadLink}</Link></p>
      ) : (
        <section className="stack">
          <h2>{t.competitors.addListing}</h2>
          <ListingForm skus={skus} />
        </section>
      )}
      {listings.length === 0 && skus.length > 0 && <p>{t.competitors.empty}</p>}
      {[...groups.values()].map((group) => {
        const recent = group.filter((l) => l.latestPriceVnd !== null && l.latestObservedOn !== null && l.latestObservedOn >= recentFrom);
        const median = competitorMedian(recent.map((l) => l.latestPriceVnd ?? 0n));
        const first = group[0];
        if (!first) return null;
        return (
          <section key={first.skuId} className="notice stack">
            <h2>{first.skuName}</h2>
            <p className="muted">{median ? fill(t.competitors.median, { price: formatVnd(median.medianVnd), n: median.listings }) : t.competitors.needTwo}</p>
            {group.map((l) => (
              <div key={l.listingId} className="stack">
                <div className="row">
                  <strong>{l.label ?? l.url.replace(/^https:\/\//, '').slice(0, 40)}</strong>
                  <a href={l.url} target="_blank" rel="noopener noreferrer nofollow">{t.competitors.open}</a>
                </div>
                <span className="muted">
                  {l.latestPriceVnd !== null && l.latestObservedOn
                    ? fill(t.competitors.latest, { price: formatVnd(l.latestPriceVnd), date: formatDate(asIsoDate(l.latestObservedOn)) })
                    : t.competitors.noPrice}
                </span>
                <ObservationForm listingId={l.listingId} today={today} />
              </div>
            ))}
          </section>
        );
      })}
      <Link href="/tong-quan">{t.competitors.dashboardLink}</Link>
    </main>
  );
}
