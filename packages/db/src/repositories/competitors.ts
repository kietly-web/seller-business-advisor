import type { ShopId } from '@sa/shared';
import { sql } from 'drizzle-orm';
import type { Tx } from '../context';
import { competitorListing, competitorObservation } from '../schema';
import { appendAudit } from './audit';
import { rowsOf } from './rows';

// The URL is stored for the seller's reference only; we never fetch it (no scraping)
export async function addCompetitorListing(tx: Tx, input: { shopId: ShopId; skuId: string; url: string; label: string | null }): Promise<string> {
  const [row] = await tx
    .insert(competitorListing)
    .values({ shopId: input.shopId, skuId: input.skuId, url: input.url, label: input.label })
    .returning({ id: competitorListing.id });
  if (!row) throw new Error('Listing could not be saved');
  return row.id;
}

export async function addCompetitorObservation(
  tx: Tx,
  input: { shopId: ShopId; listingId: string; userId: string; priceVnd: bigint; observedOn: string; note: string | null },
): Promise<string> {
  const [row] = await tx
    .insert(competitorObservation)
    .values({ shopId: input.shopId, listingId: input.listingId, priceVnd: input.priceVnd, observedOn: input.observedOn, note: input.note })
    .returning({ id: competitorObservation.id });
  if (!row) throw new Error('Observation could not be saved');
  await appendAudit(tx, { shopId: input.shopId, actor: input.userId, action: 'competitor.observed', entityId: row.id });
  return row.id;
}

export interface CompetitorRow {
  listingId: string;
  skuId: string;
  skuName: string;
  url: string;
  label: string | null;
  latestPriceVnd: bigint | null;
  latestObservedOn: string | null;
}

export async function listCompetitorListings(tx: Tx, shopId: ShopId): Promise<CompetitorRow[]> {
  const rows = rowsOf<{
    id: string; sku_id: string; name: string; variation: string | null; url: string; label: string | null; price: string | null; observed_on: string | null;
  }>(
    await tx.execute(sql`
      select l.id, l.sku_id, s.name, s.variation, l.url, l.label, o.price, o.observed_on
      from app.competitor_listing l
      join app.sku s on s.shop_id = l.shop_id and s.id = l.sku_id
      left join lateral (
        select x.price_vnd::text as price, x.observed_on::text as observed_on from app.competitor_observation x
        where x.shop_id = l.shop_id and x.listing_id = l.id order by x.observed_on desc, x.id limit 1
      ) o on true
      where l.shop_id = ${shopId}
      order by s.name, s.variation, l.created_at`),
  );
  return rows.map((r) => ({
    listingId: r.id,
    skuId: r.sku_id,
    skuName: r.variation ? `${r.name} - ${r.variation}` : r.name,
    url: r.url,
    label: r.label,
    latestPriceVnd: r.price === null ? null : BigInt(r.price),
    latestObservedOn: r.observed_on,
  }));
}

export async function listSkuOptions(tx: Tx, shopId: ShopId): Promise<{ skuId: string; label: string }[]> {
  const rows = rowsOf<{ id: string; name: string; variation: string | null }>(
    await tx.execute(sql`
      select s.id, s.name, s.variation from app.sku s
      left join lateral (
        select sum(m.net_revenue_vnd) as net from app.sku_week_metric m where m.shop_id = s.shop_id and m.sku_id = s.id
      ) r on true
      where s.shop_id = ${shopId} and s.active
      order by r.net desc nulls last, s.name
      limit 300`),
  );
  return rows.map((r) => ({ skuId: r.id, label: r.variation ? `${r.name} - ${r.variation}` : r.name }));
}
