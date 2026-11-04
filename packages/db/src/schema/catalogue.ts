import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { app, id, tstz, vnd } from './columns';
import { upload } from './ingestion';
import { shop } from './tenancy';

export const sku = app.table(
  'sku',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    platformItemId: text('platform_item_id'),
    platformModelId: text('platform_model_id'),
    sellerSku: text('seller_sku'),
    name: text('name').notNull(),
    variation: text('variation'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    unique('sku_platform_unique').on(t.shopId, t.platformItemId, t.platformModelId),
    unique('sku_shop_id_unique').on(t.shopId, t.id),
  ],
);

export const orderLine = app.table(
  'order_line',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    uploadId: uuid('upload_id').notNull(),
    sourceRow: integer('source_row').notNull(),
    orderHash: text('order_hash').notNull(),
    orderStatus: text('order_status').notNull(),
    orderedAt: tstz('ordered_at').notNull(),
    completedAt: tstz('completed_at'),
    skuId: uuid('sku_id').notNull(),
    quantity: integer('quantity').notNull(),
    unitListPriceVnd: vnd('unit_list_price_vnd').notNull(),
    grossRevenueVnd: vnd('gross_revenue_vnd').notNull(),
    sellerDiscountVnd: vnd('seller_discount_vnd').notNull().default(sql`0`),
    platformDiscountVnd: vnd('platform_discount_vnd').notNull().default(sql`0`),
  },
  (t) => [
    foreignKey({ name: 'order_line_upload_fk', columns: [t.shopId, t.uploadId], foreignColumns: [upload.shopId, upload.id] }).onDelete('cascade'),
    foreignKey({ name: 'order_line_sku_fk', columns: [t.shopId, t.skuId], foreignColumns: [sku.shopId, sku.id] }).onDelete('cascade'),
    unique('order_line_order_sku_unique').on(t.shopId, t.orderHash, t.skuId),
    index('order_line_shop_sku_completed_idx').on(t.shopId, t.skuId, t.completedAt),
    check('order_line_quantity_check', sql`${t.quantity} >= 0`),
    check(
      'order_line_status_check',
      sql`${t.orderStatus} in ('completed', 'cancelled', 'returned', 'in_progress')`,
    ),
    check('order_line_hash_check', sql`${t.orderHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const feeLine = app.table(
  'fee_line',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    uploadId: uuid('upload_id').notNull(),
    sourceRow: integer('source_row').notNull(),
    orderHash: text('order_hash').notNull(),
    skuId: uuid('sku_id'),
    feeType: text('fee_type').notNull(),
    amountVnd: vnd('amount_vnd').notNull(),
    incurredOn: date('incurred_on').notNull(),
  },
  (t) => [
    foreignKey({ name: 'fee_line_upload_fk', columns: [t.shopId, t.uploadId], foreignColumns: [upload.shopId, upload.id] }).onDelete('cascade'),
    foreignKey({ name: 'fee_line_sku_fk', columns: [t.shopId, t.skuId], foreignColumns: [sku.shopId, sku.id] }).onDelete('cascade'),
    index('fee_line_shop_order_idx').on(t.shopId, t.orderHash),
    check(
      'fee_line_type_check',
      sql`${t.feeType} in ('commission', 'transaction', 'service', 'shipping_seller', 'affiliate', 'ads', 'other')`,
    ),
    check('fee_line_hash_check', sql`${t.orderHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const productTraffic = app.table(
  'product_traffic',
  {
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    skuId: uuid('sku_id').notNull(),
    day: date('day').notNull(),
    views: integer('views'),
    visitors: integer('visitors'),
    addToCart: integer('add_to_cart'),
    orders: integer('orders'),
    units: integer('units'),
    uploadId: uuid('upload_id').notNull(),
    sourceRow: integer('source_row').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.shopId, t.skuId, t.day] }),
    foreignKey({ name: 'product_traffic_upload_fk', columns: [t.shopId, t.uploadId], foreignColumns: [upload.shopId, upload.id] }).onDelete('cascade'),
    foreignKey({ name: 'product_traffic_sku_fk', columns: [t.shopId, t.skuId], foreignColumns: [sku.shopId, sku.id] }).onDelete('cascade'),
  ],
);
