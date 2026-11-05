import { asOrderHash, type OrderHash } from '@sa/shared';

export type OrderHasher = (rawOrderId: string) => Promise<OrderHash>;

const encoder = new TextEncoder();

// Raw order IDs live only here: hex(SHA-256(salt ‖ utf8(order_id))) per 04-ingestion-parser.md
export function createOrderHasher(salt: Uint8Array): OrderHasher {
  if (salt.length < 16) {
    throw new TypeError('Order-hash salt must be at least 16 bytes');
  }
  const cache = new Map<string, Promise<OrderHash>>();
  return (rawOrderId) => {
    const id = rawOrderId.trim();
    let hash = cache.get(id);
    if (!hash) {
      hash = digest(salt, id);
      cache.set(id, hash);
    }
    return hash;
  };
}

async function digest(salt: Uint8Array, id: string): Promise<OrderHash> {
  const idBytes = encoder.encode(id);
  const input = new Uint8Array(salt.length + idBytes.length);
  input.set(salt, 0);
  input.set(idBytes, salt.length);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return asOrderHash(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
}
