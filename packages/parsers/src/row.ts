import type { IsoDate, OrderHash } from '@sa/shared';
import { normaliseHeader } from './normalise';
import type { MappedRow, OrderStatus } from './types';

export const text = (row: MappedRow, key: string): string | null => (row[key] as string | null | undefined) ?? null;
export const vnd = (row: MappedRow, key: string): bigint | null => (row[key] as bigint | null | undefined) ?? null;
export const int = (row: MappedRow, key: string): number | null => (row[key] as number | null | undefined) ?? null;
export const date = (row: MappedRow, key: string): IsoDate | null => (row[key] as IsoDate | null | undefined) ?? null;
export const orderHash = (row: MappedRow, key: string): OrderHash => row[key] as OrderHash;
export const status = (row: MappedRow, key: string): OrderStatus => row[key] as OrderStatus;

export function skuKeyOf(sellerSku: string | null, itemName: string, variation: string | null): string {
  if (sellerSku) {
    return `sku:${sellerSku}`;
  }
  return `name:${normaliseHeader(itemName)}|${normaliseHeader(variation ?? '')}`;
}
