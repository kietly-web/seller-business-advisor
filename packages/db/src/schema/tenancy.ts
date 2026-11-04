import { sql } from 'drizzle-orm';
import { boolean, check, customType, jsonb, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, id } from './columns';

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => 'bytea' });

export const shop = app.table(
  'shop',
  {
    id: id(),
    name: text('name').notNull(),
    platform: text('platform').notNull().default('shopee'),
    category: text('category'),
    isDemo: boolean('is_demo').notNull().default(false),
    orderHashSalt: bytea('order_hash_salt').notNull(),
    settings: jsonb('settings').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    check('shop_platform_check', sql`${t.platform} in ('shopee', 'tiktok', 'lazada')`),
    check('shop_salt_length_check', sql`octet_length(${t.orderHashSalt}) >= 16`),
  ],
);

export const shopMember = app.table(
  'shop_member',
  {
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.shopId, t.userId] }),
    check('shop_member_role_check', sql`${t.role} in ('owner', 'staff')`),
  ],
);

export const consentRecord = app.table(
  'consent_record',
  {
    id: id(),
    userId: text('user_id').notNull(),
    purpose: text('purpose').notNull(),
    granted: boolean('granted').notNull(),
    policyVersion: text('policy_version').notNull(),
    uiTextHash: text('ui_text_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'consent_record_purpose_check',
      sql`${t.purpose} in ('service_processing', 'anonymised_benchmarking', 'marketing')`,
    ),
  ],
);
