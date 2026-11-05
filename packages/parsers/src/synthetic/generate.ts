import { addDays, asIsoDate, daysBetween, type IsoDate } from '@sa/shared';
import { createRng, type Rng } from './random';

export interface SynthSku {
  name: string;
  variation: string;
  sellerSku: string | null;
  listPriceVnd: bigint;
  dealPriceVnd: bigint;
  cogsVnd: bigint | null;
  packagingVnd: bigint;
  weight: number;
  onHand: number;
  leadTimeDays: number;
}

export interface SynthLine {
  sku: SynthSku;
  quantity: number;
}

export type SynthStatus = 'completed' | 'cancelled' | 'returned' | 'in_progress';

export interface SynthFees {
  fixed: bigint;
  service: bigint;
  payment: bigint;
  shippingSeller: bigint;
  affiliate: bigint;
}

export interface SynthOrder {
  orderId: string;
  status: SynthStatus;
  orderedOn: IsoDate;
  orderedTime: string;
  completedOn: IsoDate | null;
  paidOn: IsoDate | null;
  lines: SynthLine[];
  sellerVoucherVnd: bigint;
  platformVoucherVnd: bigint;
  fees: SynthFees;
}

export interface SyntheticShop {
  from: IsoDate;
  to: IsoDate;
  skus: SynthSku[];
  orders: SynthOrder[];
}

export interface GenerateOptions {
  seed?: number;
  from?: IsoDate;
  days?: number;
  products?: number;
  ordersPerDay?: number;
}

const PRODUCTS = [
  'Hộp đựng đồ đa năng', 'Kệ gia vị xoay', 'Móc treo dán tường', 'Thảm lau chân cotton', 'Khăn tắm sợi tre',
  'Bình giữ nhiệt inox', 'Đèn ngủ cảm ứng', 'Gối tựa lưng', 'Rổ nhựa có nắp', 'Giá phơi đồ gấp gọn',
  'Hũ thủy tinh nắp gỗ', 'Thớt gỗ me tây', 'Bộ hộp cơm giữ nhiệt', 'Kệ để giày nhiều tầng', 'Rèm cửa chống nắng',
  'Ga giường cotton', 'Túi đựng chăn mền', 'Cây lau nhà xoay', 'Giỏ đựng đồ giặt', 'Khay đá silicon',
];
const VARIATIONS = ['Trắng', 'Xám', 'Be', 'Xanh', 'Hồng', 'Nhỏ', 'Vừa', 'Lớn'];
// Assumed fee schedule; the May 2026 change exists so fee-change rules have something to find
const FEE_CHANGE_ON = asIsoDate('2026-05-01');

function roundTo(n: number, step: number): bigint {
  return BigInt(Math.max(step, Math.round(n / step) * step));
}

function pct(amount: bigint, basisPoints: bigint): bigint {
  return (amount * basisPoints) / 10_000n;
}

function makeSkus(rng: Rng, products: number): SynthSku[] {
  const skus: SynthSku[] = [];
  for (let p = 0; p < products; p++) {
    const base = PRODUCTS[p % PRODUCTS.length] ?? 'Sản phẩm';
    const name = p < PRODUCTS.length ? base : `${base} loại ${Math.floor(p / PRODUCTS.length) + 1}`;
    const list = rng.int(39, 399) * 1000;
    const popularity = 1 / (1 + p * 0.15);
    const variations = [...VARIATIONS].sort(() => rng.next() - 0.5).slice(0, 3);
    variations.forEach((variation, v) => {
      const listPriceVnd = roundTo(list * (1 + v * 0.1), 1000);
      const dealPriceVnd = roundTo(Number(listPriceVnd) * (0.7 + rng.next() * 0.3), 1000);
      const sellerSku = rng.chance(0.1) ? null : `HL-${String(p + 1).padStart(3, '0')}-${'ABC'[v]}`;
      skus.push({
        name,
        variation,
        sellerSku,
        listPriceVnd,
        dealPriceVnd,
        cogsVnd: rng.chance(0.1) ? null : roundTo(Number(dealPriceVnd) * (0.4 + rng.next() * 0.25), 500),
        packagingVnd: roundTo(rng.int(2000, 5000), 500),
        weight: popularity * (0.5 + rng.next()),
        onHand: rng.int(0, 300),
        leadTimeDays: rng.int(3, 21),
      });
    });
  }
  return skus;
}

function demandMultiplier(day: IsoDate): number {
  const md = day.slice(5);
  if (['09-09', '10-10', '11-11', '12-12'].includes(md)) return 4;
  if (day >= '2026-01-20' && day <= '2026-02-10') return 1.8;
  if (day >= '2026-02-14' && day <= '2026-02-22') return 0.3;
  if (md.endsWith('-25')) return 1.5;
  return 1;
}

function pickWeighted(rng: Rng, skus: readonly SynthSku[], total: number): SynthSku {
  let x = rng.next() * total;
  for (const s of skus) {
    x -= s.weight;
    if (x <= 0) return s;
  }
  return skus[skus.length - 1] as SynthSku;
}

function orderId(rng: Rng, day: IsoDate, seq: number): string {
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += rng.pick([...alphabet]);
  return `${day.slice(2).replace(/-/g, '')}${suffix}${String(seq).padStart(4, '0')}`;
}

export function generateShop(options: GenerateOptions = {}): SyntheticShop {
  const rng = createRng(options.seed ?? 20_260_101);
  const from = options.from ?? asIsoDate('2025-11-01');
  const days = options.days ?? 365;
  const to = addDays(from, days - 1);
  const skus = makeSkus(rng, options.products ?? 60);
  const totalWeight = skus.reduce((s, k) => s + k.weight, 0);
  const perDay = options.ordersPerDay ?? 25;
  const orders: SynthOrder[] = [];

  for (let d = 0; d < days; d++) {
    const day = addDays(from, d);
    const count = Math.round(perDay * demandMultiplier(day) * (0.7 + rng.next() * 0.6));
    for (let i = 0; i < count; i++) {
      const lines: SynthLine[] = [];
      const lineCount = rng.chance(0.25) ? 2 : 1;
      while (lines.length < lineCount) {
        const sku = pickWeighted(rng, skus, totalWeight);
        if (!lines.some((l) => l.sku === sku)) lines.push({ sku, quantity: rng.chance(0.8) ? 1 : rng.int(2, 4) });
      }
      const recent = daysBetween(day, to) < 5;
      const roll = rng.next();
      const status: SynthStatus = recent ? 'in_progress' : roll < 0.08 ? 'cancelled' : roll < 0.12 ? 'returned' : 'completed';
      const gross = lines.reduce((s, l) => s + l.sku.dealPriceVnd * BigInt(l.quantity), 0n);
      const completedOn = status === 'completed' ? addDays(day, rng.int(3, 6)) : null;
      const fixedBp = day >= FEE_CHANGE_ON ? 500n : 400n;
      const charged = status === 'completed';
      orders.push({
        orderId: orderId(rng, day, i),
        status,
        orderedOn: day,
        orderedTime: `${String(rng.int(6, 23)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}`,
        completedOn,
        paidOn: completedOn ? addDays(completedOn, rng.int(1, 3)) : null,
        lines,
        sellerVoucherVnd: rng.chance(0.2) ? roundTo(Number(gross) * 0.05, 1000) : 0n,
        platformVoucherVnd: rng.chance(0.3) ? roundTo(Number(gross) * 0.1, 1000) : 0n,
        fees: {
          fixed: charged ? pct(gross, fixedBp) : 0n,
          service: charged ? pct(gross, 300n) : 0n,
          payment: charged ? pct(gross, 400n) : 0n,
          shippingSeller: charged && rng.chance(0.1) ? 15_000n : 0n,
          affiliate: charged && rng.chance(0.05) ? pct(gross, 1000n) : 0n,
        },
      });
    }
  }
  return { from, to, skus, orders };
}
