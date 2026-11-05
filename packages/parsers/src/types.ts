import type { IsoDate, OrderHash } from '@sa/shared';

export type ExportType =
  | 'shopee.orders'
  | 'shopee.income'
  | 'shopee.product_performance'
  | 'shopee.mass_update'
  | 'seller.unit_costs'
  | 'seller.stock';

export type ParserId = `${string}@v${number}`;

export type CellParse = 'text' | 'vnd' | 'int' | 'date' | 'datetime' | 'status' | 'order_id';

export interface ColumnSpec {
  key: string;
  aliases: string[];
  required: boolean;
  blankAllowed?: boolean;
  parse: CellParse;
}

export type OrderStatus = 'completed' | 'cancelled' | 'returned' | 'in_progress';

export type FeeType = 'commission' | 'transaction' | 'service' | 'shipping_seller' | 'affiliate' | 'ads' | 'other';

export interface OrderLineRecord {
  kind: 'order_line';
  sourceRow: number;
  orderHash: OrderHash;
  orderStatus: OrderStatus;
  orderedAt: string;
  completedAt: string | null;
  skuKey: string;
  itemName: string;
  variation: string | null;
  sellerSku: string | null;
  quantity: number;
  unitListPriceVnd: bigint;
  grossRevenueVnd: bigint;
  sellerDiscountVnd: bigint;
  platformDiscountVnd: bigint;
}

export interface FeeLineRecord {
  kind: 'fee_line';
  sourceRow: number;
  orderHash: OrderHash;
  feeType: FeeType;
  amountVnd: bigint;
  incurredOn: IsoDate;
}

export interface UnitCostRecord {
  kind: 'unit_cost';
  sourceRow: number;
  skuKey: string;
  cogsVnd: bigint;
  packagingVnd: bigint;
  effectiveFrom: IsoDate;
}

export interface StockRecord {
  kind: 'stock';
  sourceRow: number;
  skuKey: string;
  asOf: IsoDate;
  onHand: number;
  leadTimeDays: number | null;
}

export type CanonicalRecord = OrderLineRecord | FeeLineRecord | UnitCostRecord | StockRecord;

export type CellValue = string | bigint | number | IsoDate | OrderHash | null;

export type MappedRow = Readonly<Record<string, CellValue>>;

export interface RowIssue {
  sourceRow: number;
  code: 'REQUIRED_MISSING' | 'INVALID_VALUE' | 'UNKNOWN_STATUS' | 'COST_MISSING';
  column?: string;
}

export interface ParseCtx {
  today: IsoDate;
  warn(issue: RowIssue): void;
}

export interface ExportParser {
  id: ParserId;
  exportType: ExportType;
  status: 'assumed' | 'verified';
  headerRowSearch: number;
  columns: ColumnSpec[];
  statusMap?: Readonly<Record<string, OrderStatus>>;
  toCanonical(row: MappedRow, sourceRow: number, ctx: ParseCtx): CanonicalRecord[];
}
