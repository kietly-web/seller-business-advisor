import { date, orderHash, vnd } from '../row';
import type { ExportParser, FeeLineRecord, FeeType } from '../types';

const FEE_COLUMNS: { key: string; feeType: FeeType }[] = [
  { key: 'fixed_fee', feeType: 'commission' },
  { key: 'service_fee', feeType: 'service' },
  { key: 'payment_fee', feeType: 'transaction' },
  { key: 'shipping_fee_seller', feeType: 'shipping_seller' },
  { key: 'affiliate_fee', feeType: 'affiliate' },
];

export const shopeeIncomeV1: ExportParser = {
  id: 'shopee.income@v1',
  exportType: 'shopee.income',
  status: 'assumed',
  headerRowSearch: 10,
  columns: [
    { key: 'order_id', aliases: ['Mã đơn hàng', 'Order ID'], required: true, parse: 'order_id' },
    { key: 'paid_on', aliases: ['Ngày hoàn thành thanh toán', 'Ngày thanh toán', 'Payout Completed Date'], required: true, parse: 'date' },
    { key: 'fixed_fee', aliases: ['Phí cố định', 'Commission Fee'], required: true, blankAllowed: true, parse: 'vnd' },
    { key: 'service_fee', aliases: ['Phí dịch vụ', 'Service Fee'], required: true, blankAllowed: true, parse: 'vnd' },
    { key: 'payment_fee', aliases: ['Phí thanh toán', 'Transaction Fee'], required: true, blankAllowed: true, parse: 'vnd' },
    { key: 'shipping_fee_seller', aliases: ['Phí vận chuyển người bán trả', 'Phí vận chuyển thực tế'], required: false, parse: 'vnd' },
    { key: 'affiliate_fee', aliases: ['Phí hoa hồng Tiếp thị liên kết', 'Affiliate Commission'], required: false, parse: 'vnd' },
  ],
  toCanonical(row, sourceRow) {
    const hash = orderHash(row, 'order_id');
    const incurredOn = date(row, 'paid_on');
    if (!incurredOn) {
      return [];
    }
    const out: FeeLineRecord[] = [];
    for (const { key, feeType } of FEE_COLUMNS) {
      const amount = vnd(row, key);
      // Assumed: the export shows deductions as negative; a fee is stored as a positive cost
      const cost = amount === null ? 0n : amount < 0n ? -amount : amount;
      if (cost !== 0n) {
        out.push({ kind: 'fee_line', sourceRow, orderHash: hash, feeType, amountVnd: cost, incurredOn });
      }
    }
    return out;
  },
};
