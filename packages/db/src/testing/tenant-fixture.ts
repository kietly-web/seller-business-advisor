export const USERS = { a: 'fixture-owner-a', b: 'fixture-owner-b' } as const;

export function fixtureIds(shop: 'a' | 'b') {
  const id = (n: number) => `00000000-0000-0000-000${shop === 'a' ? '1' : '2'}-${String(n).padStart(12, '0')}`;
  return {
    shop: id(1),
    upload: id(2),
    sku: id(3),
    listing: id(4),
    run: id(5),
    recommendation: id(6),
  };
}

export function tenantFixtureSql(shop: 'a' | 'b'): string {
  const ids = fixtureIds(shop);
  const user = USERS[shop];
  const hash = (shop === 'a' ? 'a' : 'b').repeat(64);
  const salt = `'\\x${'00'.repeat(16)}'`;
  return `
    insert into app.shop (id, name, order_hash_salt) values ('${ids.shop}', 'Shop ${shop}', ${salt});
    insert into app.shop_member (shop_id, user_id, role) values ('${ids.shop}', '${user}', 'owner');
    insert into app.upload (id, shop_id, uploaded_by, export_type, parser_id, file_sha256, file_name, removed_columns, status)
      values ('${ids.upload}', '${ids.shop}', '${user}', 'shopee.orders', 'shopee.orders@v1', 'sha-${shop}', 'orders.xlsx', '[]', 'parsed');
    insert into app.ingest_stage (upload_id, shop_id, record_kind, source_row, record)
      values ('${ids.upload}', '${ids.shop}', 'sku', 1, '{}');
    insert into app.sku (id, shop_id, name) values ('${ids.sku}', '${ids.shop}', 'SKU ${shop}');
    insert into app.order_line (shop_id, upload_id, source_row, order_hash, order_status, ordered_at, sku_id, quantity, unit_list_price_vnd, gross_revenue_vnd)
      values ('${ids.shop}', '${ids.upload}', 1, '${hash}', 'completed', now(), '${ids.sku}', 1, 189000, 189000);
    insert into app.fee_line (shop_id, upload_id, source_row, order_hash, sku_id, fee_type, amount_vnd, incurred_on)
      values ('${ids.shop}', '${ids.upload}', 1, '${hash}', '${ids.sku}', 'commission', 9000, '2026-11-02');
    insert into app.product_traffic (shop_id, sku_id, day, views, upload_id, source_row)
      values ('${ids.shop}', '${ids.sku}', '2026-11-02', 10, '${ids.upload}', 1);
    insert into app.unit_cost (shop_id, sku_id, cogs_vnd, effective_from, source, created_by)
      values ('${ids.shop}', '${ids.sku}', 100000, '2026-11-01', 'inline', '${user}');
    insert into app.stock_snapshot (shop_id, sku_id, as_of, on_hand) values ('${ids.shop}', '${ids.sku}', '2026-11-02', 5);
    insert into app.competitor_listing (id, shop_id, sku_id, url) values ('${ids.listing}', '${ids.shop}', '${ids.sku}', 'https://shopee.vn/x-i.1.2');
    insert into app.competitor_observation (shop_id, listing_id, price_vnd, observed_on) values ('${ids.shop}', '${ids.listing}', 199000, '2026-11-02');
    insert into app.sku_week_metric (shop_id, sku_id, iso_week, units, orders, gross_revenue_vnd, seller_discount_vnd, net_revenue_vnd, platform_fees_vnd, inputs_hash)
      values ('${ids.shop}', '${ids.sku}', '2026-W45', 1, 1, 189000, 0, 189000, 9000, 'h');
    insert into app.recommendation_run (id, shop_id, iso_week, trigger, status, engine_version)
      values ('${ids.run}', '${ids.shop}', '2026-W45', 'weekly', 'succeeded', '1.0.0');
    insert into app.recommendation (id, shop_id, run_id, sku_id, rule_code, rule_version, action_type, rank, score, impact_low_vnd, impact_high_vnd, confidence, confidence_value, facts, evidence, text_vi, text_source)
      values ('${ids.recommendation}', '${ids.shop}', '${ids.run}', '${ids.sku}', 'NEGATIVE_MARGIN', 1, 'raise_price', 1, 1, 1, 2, 'medium', 0.5, '{}', '[]', '{}', 'template');
    insert into app.outcome (recommendation_id, shop_id, horizon_days, baseline, observed, result)
      values ('${ids.recommendation}', '${ids.shop}', 7, '{}', '{}', 'neutral');
    insert into app.rule_track_record (shop_id, rule_code) values ('${ids.shop}', 'NEGATIVE_MARGIN');
    insert into app.audit_log (shop_id, actor, action, entity) values ('${ids.shop}', '${user}', 'fixture', 'shop');
    insert into app.job (kind, shop_id, dedupe_key) values ('fixture', '${ids.shop}', 'fixture');
    insert into app.llm_call (shop_id, purpose, model, validation) values ('${ids.shop}', 'explain', 'test', 'passed');
  `;
}
