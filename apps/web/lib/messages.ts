import vi from '../messages/vi.json';

export const t = vi;

export type CategoryKey = keyof typeof vi.categories;

export const CATEGORY_KEYS = Object.keys(vi.categories) as CategoryKey[];

export function isCategoryKey(value: string): value is CategoryKey {
  return Object.hasOwn(vi.categories, value);
}
