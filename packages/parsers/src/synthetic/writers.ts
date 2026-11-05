import { formatDate, type IsoDate } from '@sa/shared';
import type { Table } from '../csv';
import { stockTemplate, unitCostTemplate, type UnitCostPrefill } from '../parsers/seller-templates-v1';
import { skuKeyOf } from '../row';
import type { SynthSku, SynthStatus, SyntheticShop } from './generate';

// Obviously fake buyer values; tests prove none of them survive parsing (FR-04)
export const FAKE_BUYER = {
  name: 'Nguyễn Văn Mẫu',
  username: 'nguoimua_mau',
  phone: '0900000000',
  email: 'nguoimua.mau@example.com',
  address: 'Số 1 Đường Mẫu, Phường Mẫu, Quận Mẫu',
  province: 'TP. Hồ Chí Minh',
  note: 'Giao giờ hành chính',
  tracking: 'SPXVN000000000',
} as const;

const STATUS_LABEL: Record<SynthStatus, string> = {
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  returned: 'Trả hàng/Hoàn tiền',
  in_progress: 'Đang giao',
};

const money = (n: bigint) => n.toString();
const negMoney = (n: bigint) => (n === 0n ? '0' : `-${n}`);

export function skuKey(s: SynthSku): string {
  return skuKeyOf(s.sellerSku, s.name, s.variation);
}

export function ordersExport(shop: SyntheticShop): Table {
  const header = [
    'Mã đơn hàng', 'Ngày đặt hàng', 'Trạng thái đơn hàng', 'Mã vận đơn', 'Tên sản phẩm', 'SKU phân loại hàng',
    'Tên phân loại hàng', 'Giá gốc', 'Giá ưu đãi', 'Số lượng', 'Mã giảm giá của Shop', 'Mã giảm giá của Shopee',
    'Phí cố định', 'Phí dịch vụ', 'Phí thanh toán', 'Thời gian hoàn thành đơn hàng', 'Người mua', 'Tên người nhận',
    'Số điện thoại', 'Địa chỉ nhận hàng', 'Tỉnh/Thành phố', 'Ghi chú từ người mua',
  ];
  const rows = shop.orders.flatMap((o) =>
    o.lines.map((l, i) => [
      o.orderId,
      `${o.orderedOn} ${o.orderedTime}`,
      STATUS_LABEL[o.status],
      FAKE_BUYER.tracking,
      l.sku.name,
      l.sku.sellerSku ?? '',
      l.sku.variation,
      money(l.sku.listPriceVnd),
      money(l.sku.dealPriceVnd),
      String(l.quantity),
      i === 0 ? money(o.sellerVoucherVnd) : '0',
      i === 0 ? money(o.platformVoucherVnd) : '0',
      i === 0 ? money(o.fees.fixed) : '0',
      i === 0 ? money(o.fees.service) : '0',
      i === 0 ? money(o.fees.payment) : '0',
      o.completedOn ? `${o.completedOn} 10:00` : '',
      FAKE_BUYER.username,
      FAKE_BUYER.name,
      FAKE_BUYER.phone,
      FAKE_BUYER.address,
      FAKE_BUYER.province,
      FAKE_BUYER.note,
    ]),
  );
  return [header, ...rows];
}

export function incomeExport(shop: SyntheticShop): Table {
  const header = [
    'Mã đơn hàng', 'Người mua', 'Ngày đặt hàng', 'Ngày hoàn thành thanh toán', 'Tổng tiền đã thanh toán', 'Phí cố định',
    'Phí dịch vụ', 'Phí thanh toán', 'Phí vận chuyển người bán trả', 'Phí hoa hồng Tiếp thị liên kết', 'Email',
  ];
  const rows = shop.orders
    .filter((o) => o.paidOn !== null)
    .map((o) => [
      o.orderId,
      FAKE_BUYER.username,
      formatDate(o.orderedOn),
      formatDate(o.paidOn as IsoDate),
      money(o.lines.reduce((s, l) => s + l.sku.dealPriceVnd * BigInt(l.quantity), 0n)),
      negMoney(o.fees.fixed),
      negMoney(o.fees.service),
      negMoney(o.fees.payment),
      negMoney(o.fees.shippingSeller),
      negMoney(o.fees.affiliate),
      FAKE_BUYER.email,
    ]);
  return [
    ['Báo cáo thu nhập'],
    [`Từ ${formatDate(shop.from)} đến ${formatDate(shop.to)}`],
    header,
    ...rows,
  ];
}

export function unitCostsFile(shop: SyntheticShop, effectiveFrom: IsoDate): Table {
  const current = new Map<string, UnitCostPrefill>();
  for (const s of shop.skus) {
    if (s.cogsVnd !== null) current.set(skuKey(s), { cogsVnd: s.cogsVnd, packagingVnd: s.packagingVnd, effectiveFrom });
  }
  return unitCostTemplate(shop.skus.map((s) => ({ skuKey: skuKey(s), name: `${s.name} - ${s.variation}` })), current);
}

export function stockFile(shop: SyntheticShop, asOf: IsoDate): Table {
  const table = stockTemplate(shop.skus.map((s) => ({ skuKey: skuKey(s), name: `${s.name} - ${s.variation}` })));
  shop.skus.forEach((s, i) => {
    const row = table[i + 2];
    if (row) {
      row[2] = String(s.onHand);
      row[3] = formatDate(asOf);
      row[4] = String(s.leadTimeDays);
    }
  });
  return table;
}
