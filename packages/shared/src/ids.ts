declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ShopId = Brand<string, 'ShopId'>;
export type SkuId = Brand<string, 'SkuId'>;
export type UploadId = Brand<string, 'UploadId'>;
export type RecommendationId = Brand<string, 'RecommendationId'>;
export type UserId = Brand<string, 'UserId'>;
export type OrderHash = Brand<string, 'OrderHash'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function uuidOf<T extends string>(kind: string, value: string): T {
  const normalised = value.toLowerCase();
  if (!UUID.test(normalised)) {
    throw new TypeError(`Invalid ${kind}: expected a UUID`);
  }
  return normalised as T;
}

export const asShopId = (value: string): ShopId => uuidOf<ShopId>('ShopId', value);
export const asSkuId = (value: string): SkuId => uuidOf<SkuId>('SkuId', value);
export const asUploadId = (value: string): UploadId => uuidOf<UploadId>('UploadId', value);
export const asRecommendationId = (value: string): RecommendationId =>
  uuidOf<RecommendationId>('RecommendationId', value);

export function asUserId(value: string): UserId {
  if (value.length === 0) {
    throw new TypeError('Invalid UserId: empty');
  }
  return value as UserId;
}

// The error never echoes the value: a non-hash here may be a raw Shopee order ID (C3 data)
export function asOrderHash(value: string): OrderHash {
  if (!SHA256_HEX.test(value)) {
    throw new TypeError('Invalid OrderHash: expected 64 lowercase hex characters');
  }
  return value as OrderHash;
}
