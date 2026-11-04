import { sql } from 'drizzle-orm';
import { check, date, integer, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, id, vnd } from './columns';
import { sku } from './catalogue';
import { shop } from './tenancy';

export const unitCost = app.table(
  'unit_cost',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    skuId: uuid('sku_id')
      .notNull()
      .references(() => sku.id, { onDelete: 'cascade' }),
    cogsVnd: vnd('cogs_vnd').notNull(),
    packagingVnd: vnd('packaging_vnd').notNull().default(sql`0`),
    effectiveFrom: date('effective_from').notNull(),
    source: text('source').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('unit_cost_sku_effective_unique').on(t.shopId, t.skuId, t.effectiveFrom),
    check('unit_cost_cogs_check', sql`${t.cogsVnd} >= 0`),
    check('unit_cost_source_check', sql`${t.source} in ('template', 'inline', 'category_default')`),
  ],
);

export const stockSnapshot = app.table(
  'stock_snapshot',
  {
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    skuId: uuid('sku_id')
      .notNull()
      .references(() => sku.id, { onDelete: 'cascade' }),
    asOf: date('as_of').notNull(),
    onHand: integer('on_hand').notNull(),
    leadTimeDays: integer('lead_time_days'),
  },
  (t) => [primaryKey({ columns: [t.shopId, t.skuId, t.asOf] })],
);

export const competitorListing = app.table(
  'competitor_listing',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    skuId: uuid('sku_id')
      .notNull()
      .references(() => sku.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    label: text('label'),
    createdAt: createdAt(),
  },
  (t) => [check('competitor_listing_url_check', sql`${t.url} ~ '^https://(shopee\\.vn|s\\.shopee\\.vn)/'`)],
);

export const competitorObservation = app.table(
  'competitor_observation',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => competitorListing.id, { onDelete: 'cascade' }),
    priceVnd: vnd('price_vnd').notNull(),
    observedOn: date('observed_on').notNull(),
    note: text('note'),
  },
  (t) => [check('competitor_observation_price_check', sql`${t.priceVnd} > 0`)],
);
