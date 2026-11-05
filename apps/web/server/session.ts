import 'server-only';
import { appDb, listMyShops, withUserContext, type ShopSummary } from '@sa/db';
import { asUserId } from '@sa/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthNotConfiguredError } from './auth-config';
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

// Public pages render as signed out when auth isn't configured; signed-in pages still fail through requireUser
export async function getOptionalSessionUser(): Promise<SessionUser | null> {
  try {
    return await getSessionUser();
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      console.error(`[auth] not configured: ${error.message}`);
      return null;
    }
    throw error;
  }
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
