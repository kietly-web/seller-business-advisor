import 'server-only';
import { appDb, listMyShops, withUserContext, type ShopSummary } from '@sa/db';
import { asUserId } from '@sa/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from './auth-instance';
import { hasServiceConsent } from './consents';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect('/dang-nhap');
  }
  return user;
}

// Consent is written by a hook after the user row commits, so a failed write can leave an account without it
export async function requireConsentedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await hasServiceConsent(appDb(), user.id))) {
    redirect('/dong-y');
  }
  return user;
}

export async function myShops(userId: string): Promise<ShopSummary[]> {
  return withUserContext(appDb(), asUserId(userId), listMyShops);
}

export async function requireShop(): Promise<{ user: SessionUser; shop: ShopSummary }> {
  const user = await requireConsentedUser();
  const [shop] = await myShops(user.id);
  if (!shop) {
    redirect('/bat-dau');
  }
  return { user, shop };
}
