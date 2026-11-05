'use server';

import { appDb } from '@sa/db';
import { redirect } from 'next/navigation';
import { createShopForUser, demoShopInput, parseOnboarding, type FieldErrors } from '../../server/onboarding';
import { myShops, requireUser } from '../../server/session';

export interface OnboardingState {
  errors: FieldErrors;
}

async function userWithoutShop() {
  const user = await requireUser();
  if ((await myShops(user.id)).length > 0) {
    redirect('/tong-quan');
  }
  return user;
}

export async function createShopAction(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const user = await userWithoutShop();
  const parsed = parseOnboarding(form);
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }
  await createShopForUser(appDb(), user.id, { ...parsed.value, isDemo: false });
  redirect('/tong-quan');
}

export async function createDemoShopAction(): Promise<void> {
  const user = await userWithoutShop();
  await createShopForUser(appDb(), user.id, demoShopInput());
  redirect('/tong-quan');
}
