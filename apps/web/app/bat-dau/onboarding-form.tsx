'use client';

import { useActionState } from 'react';
import { CATEGORY_KEYS, t } from '../../lib/messages';
import { createShopAction, type OnboardingState } from './actions';

const initial: OnboardingState = { errors: {} };

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createShopAction, initial);
  const { errors } = state;
  return (
    <form action={action} noValidate>
      <label>
        {t.onboarding.shopName}
        <input type="text" name="name" maxLength={80} required aria-invalid={!!errors.name} aria-describedby="shop-name-error" />
        {errors.name && <span id="shop-name-error" className="field-error">{errors.name}</span>}
      </label>
      <label>
        {t.onboarding.category}
        <select name="category" required defaultValue="" aria-invalid={!!errors.category} aria-describedby="category-error">
          <option value="" disabled>—</option>
          {CATEGORY_KEYS.map((key) => (
            <option key={key} value={key}>{t.categories[key]}</option>
          ))}
        </select>
        {errors.category && <span id="category-error" className="field-error">{errors.category}</span>}
      </label>
      <label>
        {t.onboarding.targetMargin}
        <input type="number" name="targetMargin" min={1} max={80} step={1} defaultValue={15} inputMode="numeric" aria-invalid={!!errors.targetMargin} aria-describedby="margin-hint margin-error" />
        <span id="margin-hint" className="muted">{t.onboarding.targetMarginHint}</span>
        {errors.targetMargin && <span id="margin-error" className="field-error">{errors.targetMargin}</span>}
      </label>
      <button type="submit" disabled={pending}>{t.onboarding.submit}</button>
    </form>
  );
}
