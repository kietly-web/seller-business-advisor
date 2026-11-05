import { normaliseHeader } from './normalise';

// Known buyer-field headers (vi + en). Parsers must never map these (FR-04, ADR-003).
export const PII_HEADERS: readonly string[] = [
  'Tên người nhận',
  'Người nhận',
  'Tên người mua',
  'Người mua',
  'Username (Buyer)',
  'Tên đăng nhập người mua',
  'Số điện thoại',
  'Số điện thoại người nhận',
  'SĐT',
  'Địa chỉ nhận hàng',
  'Địa chỉ',
  'Phường/Xã',
  'Quận/Huyện',
  'Tỉnh/Thành phố',
  'Email',
  'Ghi chú từ người mua',
  'Nhận xét từ người mua',
  'Mã vận đơn',
  'Recipient name',
  'Recipient phone',
  'Phone number',
  'Shipping address',
  'Delivery address',
  'Buyer username',
  'Buyer note',
  'Tracking number',
];

const NORMALISED = new Set(PII_HEADERS.map(normaliseHeader));

export function isPiiHeader(header: string): boolean {
  const n = normaliseHeader(header);
  return NORMALISED.has(n) || /\b(email|so dien thoai|dia chi|nguoi nhan|nguoi mua|buyer|recipient|phone)\b/.test(n);
}
