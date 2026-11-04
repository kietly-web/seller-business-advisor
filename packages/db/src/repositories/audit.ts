import type { ShopId } from '@sa/shared';
import type { Tx } from '../context';
import { auditLog } from '../schema';

export async function appendAudit(
  tx: Tx,
  entry: {
    shopId: ShopId | null;
    actor: string;
    action: string;
    entity: string;
    entityId?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    shopId: entry.shopId,
    actor: entry.actor,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    meta: entry.meta ?? {},
  });
}
