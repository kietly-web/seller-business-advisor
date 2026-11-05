import { formatDate, type IsoDate } from '@sa/shared';
import type { Table } from '../csv';
import { date, int, text, vnd } from '../row';
import type { ExportParser } from '../types';

export const UNIT_COST_HEADERS = ['Mã SKU (không sửa)', 'Tên sản phẩm (không sửa)', 'Giá vốn (₫)', 'Bao bì (₫)', 'Áp dụng từ (dd/MM/yyyy)'];
export const STOCK_HEADERS = ['Mã SKU (không sửa)', 'Tên sản phẩm (không sửa)', 'Tồn kho', 'Ngày kiểm kho (dd/MM/yyyy)', 'Thời gian nhập hàng (ngày)'];

export const sellerUnitCostsV1: ExportParser = {
  id: 'seller.unit_costs@v1',
  exportType: 'seller.unit_costs',
  status: 'verified',
  headerRowSearch: 5,
  columns: [
    { key: 'sku_key', aliases: ['sku_key', UNIT_COST_HEADERS[0] ?? ''], required: true, parse: 'text' },
    { key: 'name', aliases: ['ten_san_pham', UNIT_COST_HEADERS[1] ?? ''], required: false, parse: 'text' },
    { key: 'cogs', aliases: ['gia_von', UNIT_COST_HEADERS[2] ?? ''], required: true, blankAllowed: true, parse: 'vnd' },
    { key: 'packaging', aliases: ['bao_bi', UNIT_COST_HEADERS[3] ?? ''], required: false, parse: 'vnd' },
    { key: 'effective_from', aliases: ['ap_dung_tu', UNIT_COST_HEADERS[4] ?? ''], required: false, parse: 'date' },
  ],
  toCanonical(row, sourceRow, ctx) {
    const skuKey = text(row, 'sku_key') ?? '';
    const cogs = vnd(row, 'cogs');
    if (cogs === null) {
      ctx.warn({ sourceRow, code: 'COST_MISSING', column: 'cogs' });
      return [];
    }
    const packaging = vnd(row, 'packaging') ?? 0n;
    if (cogs < 0n || packaging < 0n) {
      ctx.warn({ sourceRow, code: 'INVALID_VALUE', column: cogs < 0n ? 'cogs' : 'packaging' });
      return [];
    }
    return [
      {
        kind: 'unit_cost',
        sourceRow,
        skuKey,
        cogsVnd: cogs,
        packagingVnd: packaging,
        effectiveFrom: date(row, 'effective_from') ?? ctx.today,
      },
    ];
  },
};

export const sellerStockV1: ExportParser = {
  id: 'seller.stock@v1',
  exportType: 'seller.stock',
  status: 'verified',
  headerRowSearch: 5,
  columns: [
    { key: 'sku_key', aliases: ['sku_key', STOCK_HEADERS[0] ?? ''], required: true, parse: 'text' },
    { key: 'name', aliases: ['ten_san_pham', STOCK_HEADERS[1] ?? ''], required: false, parse: 'text' },
    { key: 'on_hand', aliases: ['ton_kho', STOCK_HEADERS[2] ?? ''], required: true, parse: 'int' },
    { key: 'as_of', aliases: ['ngay', STOCK_HEADERS[3] ?? ''], required: false, parse: 'date' },
    { key: 'lead_time_days', aliases: ['thoi_gian_nhap_hang', STOCK_HEADERS[4] ?? ''], required: false, parse: 'int' },
  ],
  toCanonical(row, sourceRow, ctx) {
    const onHand = int(row, 'on_hand') ?? 0;
    const lead = int(row, 'lead_time_days');
    if (onHand < 0 || (lead !== null && lead < 0)) {
      ctx.warn({ sourceRow, code: 'INVALID_VALUE', column: onHand < 0 ? 'on_hand' : 'lead_time_days' });
      return [];
    }
    return [
      {
        kind: 'stock',
        sourceRow,
        skuKey: text(row, 'sku_key') ?? '',
        asOf: date(row, 'as_of') ?? ctx.today,
        onHand,
        leadTimeDays: lead,
      },
    ];
  },
};

export interface TemplateSku {
  skuKey: string;
  name: string;
}

export interface UnitCostPrefill {
  cogsVnd: bigint;
  packagingVnd: bigint;
  effectiveFrom: IsoDate;
}

export function unitCostTemplate(skus: readonly TemplateSku[], current: ReadonlyMap<string, UnitCostPrefill> = new Map()): Table {
  return [
    ['Nhập giá vốn cho từng sản phẩm. Không sửa hai cột đầu. Để trống nếu chưa biết.'],
    [...UNIT_COST_HEADERS],
    ...skus.map((s) => {
      const c = current.get(s.skuKey);
      return [s.skuKey, s.name, c ? String(c.cogsVnd) : '', c ? String(c.packagingVnd) : '', c ? formatDate(c.effectiveFrom) : ''];
    }),
  ];
}

export function stockTemplate(skus: readonly TemplateSku[]): Table {
  return [
    ['Nhập số tồn kho hiện tại cho từng sản phẩm. Không sửa hai cột đầu.'],
    [...STOCK_HEADERS],
    ...skus.map((s) => [s.skuKey, s.name, '', '', '']),
  ];
}
