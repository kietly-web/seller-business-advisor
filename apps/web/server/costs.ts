import { listSkuCosts, setUnitCost, withShopContext, type Db, type SkuCost } from '@sa/db';
import { stockTemplate, unitCostTemplate, writeCsv, type TemplateSku, type UnitCostPrefill } from '@sa/parsers';
import { recomputeInTx } from './metrics';
import { asIsoDate, asSkuId, asUserId, parseVnd, type IsoDate, type ShopId } from '@sa/shared';

interface Who {
  userId: string;
  shopId: ShopId;
}

const MAX_VND = 1_000_000_000n;

const inShop = <T>(db: Db, who: Who, fn: Parameters<typeof withShopContext<T>>[2]) =>
  withShopContext(db, { role: 'sa_app', shopId: who.shopId, userId: asUserId(who.userId) }, fn);

export function listCosts(db: Db, who: Who, today: IsoDate): Promise<SkuCost[]> {
  return inShop(db, who, (tx) => listSkuCosts(tx, who.shopId, today));
}

export function parseCostForm(form: FormData): { skuId: string; cogsVnd: bigint; packagingVnd: bigint } | null {
  const skuId = String(form.get('skuId') ?? '');
  const cogs = parseVnd(String(form.get('cogs') ?? ''));
  const packagingRaw = String(form.get('packaging') ?? '').trim();
  const packaging = packagingRaw === '' ? 0n : parseVnd(packagingRaw);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(skuId) || cogs === null || packaging === null) return null;
  if (cogs < 0n || packaging < 0n || cogs > MAX_VND || packaging > MAX_VND) return null;
  return { skuId, cogsVnd: cogs, packagingVnd: packaging };
}

export async function saveCost(db: Db, who: Who, form: FormData, today: IsoDate): Promise<boolean> {
  const input = parseCostForm(form);
  if (!input) return false;
  const skuId = asSkuId(input.skuId);
  await inShop(db, who, async (tx) => {
    await setUnitCost(tx, { shopId: who.shopId, skuId, userId: who.userId, cogsVnd: input.cogsVnd, packagingVnd: input.packagingVnd, effectiveFrom: today });
    await recomputeInTx(tx, who.shopId, [skuId]);
  });
  return true;
}

function templateSkus(costs: readonly SkuCost[]): TemplateSku[] {
  return costs.flatMap((c) => (c.skuKey ? [{ skuKey: c.skuKey, name: c.variation ? `${c.name} - ${c.variation}` : c.name }] : []));
}

export async function templateCsv(db: Db, who: Who, kind: 'gia-von' | 'ton-kho', today: IsoDate): Promise<string> {
  const costs = await listCosts(db, who, today);
  if (kind === 'ton-kho') {
    return `﻿${writeCsv(stockTemplate(templateSkus(costs)))}`;
  }
  const current = new Map<string, UnitCostPrefill>();
  for (const c of costs) {
    if (c.skuKey && c.cogsVnd !== null && c.effectiveFrom) {
      current.set(c.skuKey, { cogsVnd: c.cogsVnd, packagingVnd: c.packagingVnd ?? 0n, effectiveFrom: asIsoDate(c.effectiveFrom) });
    }
  }
  return `﻿${writeCsv(unitCostTemplate(templateSkus(costs), current))}`;
}
