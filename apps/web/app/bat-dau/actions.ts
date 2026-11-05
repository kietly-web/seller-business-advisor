'use server';

import { appDb, ShopAlreadyExistsError } from '@sa/db';
import { redirect } from 'next/navigation';
import { createShopForUser, demoShopInput, parseOnboarding, type FieldErrors } from '../../server/onboarding';
import { myShops, requireConsentedUser } from '../../server/session';

export interface OnboardingState {
  errors: FieldErrors;
}

async function userWithoutShop() {
  const user = await requireConsentedUser();
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
  await createOnce(user.id, { ...parsed.value, isDemo: false });
  redirect('/tong-quan');
}

export async function createDemoShopAction(): Promise<void> {
  const user = await userWithoutShop();
  await createOnce(user.id, demoShopInput());
  redirect('/tong-quan');
}

async function createOnce(userId: string, input: Parameters<typeof createShopForUser>[2]): Promise<void> {
  try {
    await createShopForUser(appDb(), userId, input);
  } catch (error) {
    if (!(error instanceof ShopAlreadyExistsError)) {
      throw error;
    }
  }
}
