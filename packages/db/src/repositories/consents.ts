import type { UserId } from '@sa/shared';
import { desc } from 'drizzle-orm';
import type { Tx } from '../context';
import { consentRecord } from '../schema';

export type ConsentPurpose = 'service_processing' | 'anonymised_benchmarking' | 'marketing';

export interface ConsentDecision {
  purpose: ConsentPurpose;
  granted: boolean;
}

export async function recordConsents(
  tx: Tx,
  input: {
    userId: UserId;
    decisions: ConsentDecision[];
    policyVersion: string;
    uiTextHash: string;
    userAgent: string | null;
  },
): Promise<void> {
  if (input.decisions.length === 0) {
    return;
  }
  await tx.insert(consentRecord).values(
    input.decisions.map((d) => ({
      userId: input.userId,
      purpose: d.purpose,
      granted: d.granted,
      policyVersion: input.policyVersion,
      uiTextHash: input.uiTextHash,
      userAgent: input.userAgent,
    })),
  );
}

export async function currentConsents(tx: Tx): Promise<Partial<Record<ConsentPurpose, boolean>>> {
  const rows = await tx
    .selectDistinctOn([consentRecord.purpose], { purpose: consentRecord.purpose, granted: consentRecord.granted })
    .from(consentRecord)
    .orderBy(consentRecord.purpose, desc(consentRecord.createdAt), desc(consentRecord.id));
  return Object.fromEntries(rows.map((r) => [r.purpose, r.granted]));
}
