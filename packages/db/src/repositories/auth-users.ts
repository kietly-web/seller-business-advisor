import { eq } from 'drizzle-orm';
import type { Db } from '../context';
import { user } from '../schema';

// Runs outside withContext on purpose: auth.* is reachable only through the connecting role's sa_auth membership
export async function authUserExists(db: Db, userId: string): Promise<boolean> {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  return rows.length > 0;
}
