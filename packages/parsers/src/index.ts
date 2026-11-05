import { shopeeIncomeV1 } from './parsers/shopee-income-v1';
import { shopeeOrdersV1 } from './parsers/shopee-orders-v1';
import { sellerStockV1, sellerUnitCostsV1 } from './parsers/seller-templates-v1';
import type { ExportParser, ParserId } from './types';

export const REGISTRY: readonly ExportParser[] = [shopeeOrdersV1, shopeeIncomeV1, sellerUnitCostsV1, sellerStockV1];

export function parserById(id: ParserId): ExportParser | undefined {
  return REGISTRY.find((p) => p.id === id);
}

export * from './types';
export { readCsv, writeCsv, type Table } from './csv';
export { detect, bestHeaderRow, scoreHeaders, ACCEPT_SCORE, ACCEPT_MARGIN, type Candidate, type Detection } from './detect';
export { prepare, transform, type PreparedTable, type RemovedColumn, type TransformResult } from './pipeline';
export { createOrderHasher, type OrderHasher } from './hash';
export { isPiiHeader, PII_HEADERS } from './pii-headers';
export { normaliseHeader } from './normalise';
export { unitCostTemplate, stockTemplate, type TemplateSku, type UnitCostPrefill } from './parsers/seller-templates-v1';
export { shopeeOrdersV1, shopeeIncomeV1, sellerUnitCostsV1, sellerStockV1 };
export { MAX_CHUNK_BYTES, MAX_CHUNK_RECORDS, chunkRecords, fromWire, looksLikePii, recordHasPii, toWire, wireChunk, type WireRecord } from './wire';
