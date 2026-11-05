'use server';

import { appDb, ShopAlreadyExistsError, withShopContext } from '@sa/db';
import { asUserId, toIctDate, type ShopId } from '@sa/shared';
import { redirect } from 'next/navigation';
import { seedDemoShop } from '../../server/demo-seed';
import { explainForShop } from '../../server/llm';
import { runRecommendations } from '../../server/weekly-run';
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
  const shopId = await createOnce(user.id, demoShopInput());
  if (shopId) {
    await seedDemoShop(appDb(), { userId: user.id, shopId }, toIctDate(new Date()));
    // The demo still opens if the first run fails; the seller can refresh the cards later
    await firstRun(user.id, shopId).catch((error: unknown) =>
      console.error(`[demo] first run failed: ${error instanceof Error ? error.constructor.name : 'unknown'}`),
    );
  }
  redirect('/tong-quan');
}

async function createOnce(userId: string, input: Parameters<typeof createShopForUser>[2]): Promise<ShopId | null> {
  try {
    return await createShopForUser(appDb(), userId, input);
  } catch (error) {
    if (!(error instanceof ShopAlreadyExistsError)) {
      throw error;
    }
    return null;
  }
}

// The demo shop opens with this week's cards already there
async function firstRun(userId: string, shopId: ShopId): Promise<void> {
  const db = appDb();
  await runRecommendations(
    (fn) => withShopContext(db, { role: 'sa_app', shopId, userId: asUserId(userId) }, fn),
    shopId,
    { trigger: 'on_demand', now: new Date(), explain: explainForShop(db, shopId) },
  );
}
