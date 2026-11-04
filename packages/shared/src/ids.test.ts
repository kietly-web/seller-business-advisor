import { describe, expect, it } from 'vitest';
import { asOrderHash, asShopId, asUserId } from './ids';

describe('ids', () => {
  it('normalises UUIDs to lowercase', () => {
    expect(asShopId('3F2A9C1E-5B7D-4E8A-9C21-7D4E5F6A8B90')).toBe('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90');
  });

  it('rejects non-UUID shop ids', () => {
    expect(() => asShopId('shop-1')).toThrow(TypeError);
  });

  it('rejects empty user ids', () => {
    expect(() => asUserId('')).toThrow(TypeError);
  });

  it('accepts a SHA-256 hex order hash', () => {
    const hash = 'a'.repeat(64);
    expect(asOrderHash(hash)).toBe(hash);
  });

  it('rejects a raw order ID without echoing it in the error', () => {
    const rawOrderId = '251104ABCDEF12';
    expect(() => asOrderHash(rawOrderId)).toThrow(TypeError);
    try {
      asOrderHash(rawOrderId);
    } catch (error) {
      expect(String(error)).not.toContain(rawOrderId);
    }
  });
});
