import { normaliseHeader } from '../normalise';
import { int, orderHash, skuKeyOf, status, text, vnd } from '../row';
import type { ExportParser, OrderStatus } from '../types';

const STATUSES: Record<string, OrderStatus> = {
  'Hoàn thành': 'completed',
  'Đã giao': 'in_progress',
  'Đã hủy': 'cancelled',
  'Hủy': 'cancelled',
  'Trả hàng/Hoàn tiền': 'returned',
  'Đã trả hàng': 'returned',
  'Đang giao': 'in_progress',
  'Chờ xác nhận': 'in_progress',
  'Chờ lấy hàng': 'in_progress',
  'Chờ giao hàng': 'in_progress',
  'Completed': 'completed',
  'Cancelled': 'cancelled',
};

export const shopeeOrdersV1: ExportParser = {
  id: 'shopee.orders@v1',
  exportType: 'shopee.orders',
  status: 'assumed',
  headerRowSearch: 10,
  statusMap: Object.fromEntries(Object.entries(STATUSES).map(([k, v]) => [normaliseHeader(k), v])),
  columns: [
    { key: 'order_id', aliases: ['Mã đơn hàng', 'Order ID'], required: true, parse: 'order_id' },
    { key: 'order_status', aliases: ['Trạng thái đơn hàng', 'Order Status'], required: true, parse: 'status' },
    { key: 'ordered_at', aliases: ['Ngày đặt hàng', 'Order Creation Date'], required: true, parse: 'datetime' },
    { key: 'completed_at', aliases: ['Thời gian hoàn thành đơn hàng', 'Order Complete Time'], required: false, parse: 'datetime' },
    { key: 'item_name', aliases: ['Tên sản phẩm', 'Product Name'], required: true, parse: 'text' },
    { key: 'variation', aliases: ['Tên phân loại hàng', 'Variation Name'], required: false, parse: 'text' },
    { key: 'seller_sku', aliases: ['SKU phân loại hàng', 'SKU sản phẩm', 'SKU Reference No.'], required: false, parse: 'text' },
    { key: 'list_price', aliases: ['Giá gốc', 'Original Price'], required: true, parse: 'vnd' },
    { key: 'deal_price', aliases: ['Giá ưu đãi', 'Deal Price'], required: true, parse: 'vnd' },
    { key: 'quantity', aliases: ['Số lượng', 'Quantity'], required: true, parse: 'int' },
    { key: 'seller_voucher', aliases: ['Mã giảm giá của Shop', 'Seller Voucher'], required: false, parse: 'vnd' },
    { key: 'platform_voucher', aliases: ['Mã giảm giá của Shopee', 'Shopee Voucher'], required: false, parse: 'vnd' },
  ],
  toCanonical(row, sourceRow, ctx) {
    const quantity = int(row, 'quantity') ?? 0;
    const listPrice = vnd(row, 'list_price') ?? 0n;
    const dealPrice = vnd(row, 'deal_price') ?? 0n;
    if (quantity < 0 || listPrice < 0n || dealPrice < 0n) {
      ctx.warn({ sourceRow, code: 'INVALID_VALUE' });
      return [];
    }
    const itemName = text(row, 'item_name') ?? '';
    const variation = text(row, 'variation');
    const sellerSku = text(row, 'seller_sku');
    return [
      {
        kind: 'order_line',
        sourceRow,
        orderHash: orderHash(row, 'order_id'),
        orderStatus: status(row, 'order_status'),
        orderedAt: text(row, 'ordered_at') ?? '',
        completedAt: text(row, 'completed_at'),
        skuKey: skuKeyOf(sellerSku, itemName, variation),
        itemName,
        variation,
        sellerSku,
        quantity,
        unitListPriceVnd: listPrice,
        grossRevenueVnd: dealPrice * BigInt(quantity),
        sellerDiscountVnd: abs(vnd(row, 'seller_voucher') ?? 0n),
        platformDiscountVnd: abs(vnd(row, 'platform_voucher') ?? 0n),
      },
    ];
  },
};

function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}
