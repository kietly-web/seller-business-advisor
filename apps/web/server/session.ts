import 'server-only';
import { appDb, listMyShops, withUserContext, type ShopSummary } from '@sa/db';
import { asUserId } from '@sa/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from './auth-instance';

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

export async function myShops(userId: string): Promise<ShopSummary[]> {
  return withUserContext(appDb(), asUserId(userId), listMyShops);
}

export async function requireShop(): Promise<{ user: SessionUser; shop: ShopSummary }> {
  const user = await requireUser();
  const [shop] = await myShops(user.id);
  if (!shop) {
    redirect('/bat-dau');
  }
  return { user, shop };
}
