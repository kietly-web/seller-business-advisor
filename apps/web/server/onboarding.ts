import { createShop, withUserContext, type Db } from '@sa/db';
import { asUserId, type ShopId } from '@sa/shared';
import { isCategoryKey, t, type CategoryKey } from '../lib/messages';

export interface OnboardingInput {
  name: string;
  category: CategoryKey;
  targetMarginPct: number;
}

export type FieldErrors = Partial<Record<'name' | 'category' | 'targetMargin', string>>;

export function parseOnboarding(form: FormData): { ok: true; value: OnboardingInput } | { ok: false; errors: FieldErrors } {
  const name = String(form.get('name') ?? '').trim();
  const category = String(form.get('category') ?? '');
  const margin = Number(String(form.get('targetMargin') ?? '').replace(',', '.'));
  const errors: FieldErrors = {};
  if (name.length === 0 || name.length > 80) {
    errors.name = t.errors.required;
  }
  if (!isCategoryKey(category)) {
    errors.category = t.errors.invalidCategory;
  }
  if (!Number.isFinite(margin) || margin < 1 || margin > 80) {
    errors.targetMargin = t.errors.invalidMargin;
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { name, category: category as CategoryKey, targetMarginPct: margin } };
}

export async function createShopForUser(
  db: Db,
  userId: string,
  input: OnboardingInput & { isDemo: boolean },
): Promise<ShopId> {
  return withUserContext(db, asUserId(userId), (tx) =>
    createShop(tx, {
      name: input.name,
      category: input.category,
      isDemo: input.isDemo,
      settings: { targetMarginPct: input.targetMarginPct },
    }),
  );
}

export function demoShopInput(): OnboardingInput & { isDemo: true } {
  return { name: t.onboarding.demoShopName, category: 'nha_cua_doi_song', targetMarginPct: 15, isDemo: true };
}
