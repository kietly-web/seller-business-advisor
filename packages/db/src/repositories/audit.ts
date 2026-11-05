import type { ShopId } from '@sa/shared';
import type { Tx } from '../context';
import { auditLog } from '../schema';

export const AUDIT_ACTIONS = {
  'consent.recorded': { entity: 'consent_record', item: 'SA-106' },
  'consent.withdrawn': { entity: 'consent_record', item: 'SA-106' },
  'shop.created': { entity: 'shop', item: 'SA-107' },
  'shop.renamed': { entity: 'shop', item: 'SA-107' },
  'upload.created': { entity: 'upload', item: 'SA-205' },
  'upload.completed': { entity: 'upload', item: 'SA-205' },
  'upload.rejected_pii': { entity: 'upload', item: 'SA-205' },
  'upload.aborted': { entity: 'upload', item: 'SA-205' },
  'cost.changed': { entity: 'unit_cost', item: 'SA-207' },
  'competitor.observed': { entity: 'competitor_observation', item: 'SA-408' },
  'competitor.listing_added': { entity: 'competitor_listing', item: 'SA-408' },
  'recommendation.rated': { entity: 'recommendation', item: 'SA-407' },
  'recommendation.accepted': { entity: 'recommendation', item: 'SA-407' },
  'recommendation.dismissed': { entity: 'recommendation', item: 'SA-407' },
  'recommendation.done': { entity: 'recommendation', item: 'SA-407' },
  'dsr.requested': { entity: 'data_request', item: 'SA-502' },
  'dsr.export_downloaded': { entity: 'data_request', item: 'SA-502' },
  'dsr.completed': { entity: 'data_request', item: 'SA-503' },
  'admin.access': { entity: 'shop', item: 'SA-509' },
} as const satisfies Record<string, { entity: string; item: string }>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export function isAuditAction(value: string): value is AuditAction {
  return Object.hasOwn(AUDIT_ACTIONS, value);
}

export async function appendAudit(
  tx: Tx,
  entry: {
    shopId: ShopId | null;
    actor: string;
    action: AuditAction;
    entityId?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  if (!isAuditAction(entry.action)) {
    throw new TypeError(`Unknown audit action: ${String(entry.action)}`);
  }
  await tx.insert(auditLog).values({
    shopId: entry.shopId,
    actor: entry.actor,
    action: entry.action,
    entity: AUDIT_ACTIONS[entry.action].entity,
    entityId: entry.entityId ?? null,
    meta: entry.meta ?? {},
  });
}
