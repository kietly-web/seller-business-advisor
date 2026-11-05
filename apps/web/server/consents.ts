import { createHash } from 'node:crypto';
import {
  appendAudit,
  currentConsents,
  recordConsents,
  withUserContext,
  type ConsentDecision,
  type ConsentPurpose,
  type Db,
} from '@sa/db';
import { asUserId } from '@sa/shared';
import { t } from '../lib/messages';

export const CONSENT_POLICY_VERSION = '2026-11-v1';
export const CONSENT_PURPOSES: readonly ConsentPurpose[] = ['service_processing', 'anonymised_benchmarking', 'marketing'];
export const OPTIONAL_PURPOSES: readonly ConsentPurpose[] = ['anonymised_benchmarking', 'marketing'];

export function consentTextHash(): string {
  const shown = { legend: t.signUp.consentsLegend, hint: t.signUp.consentsHint, boxes: t.consents };
  return createHash('sha256').update(JSON.stringify(shown)).digest('hex');
}

export function parseConsentChoices(value: unknown): Record<ConsentPurpose, boolean> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const choices = {} as Record<ConsentPurpose, boolean>;
  for (const purpose of CONSENT_PURPOSES) {
    if (typeof raw[purpose] !== 'boolean') {
      return null;
    }
    choices[purpose] = raw[purpose];
  }
  return choices;
}

export async function recordSignUpConsents(
  db: Db,
  userId: string,
  choices: Record<ConsentPurpose, boolean>,
  userAgent: string | null,
): Promise<void> {
  const uid = asUserId(userId);
  await withUserContext(db, uid, async (tx) => {
    await recordConsents(tx, {
      userId: uid,
      decisions: CONSENT_PURPOSES.map((purpose) => ({ purpose, granted: choices[purpose] })),
      policyVersion: CONSENT_POLICY_VERSION,
      uiTextHash: consentTextHash(),
      userAgent,
    });
    await appendAudit(tx, { shopId: null, actor: uid, action: 'consent.recorded', meta: { ...choices } });
  });
}

export async function updateOptionalConsents(
  db: Db,
  userId: string,
  desired: Partial<Record<ConsentPurpose, boolean>>,
  userAgent: string | null,
): Promise<ConsentDecision[]> {
  const uid = asUserId(userId);
  return withUserContext(db, uid, async (tx) => {
    const current = await currentConsents(tx);
    const changes: ConsentDecision[] = OPTIONAL_PURPOSES.filter(
      (p) => desired[p] !== undefined && desired[p] !== (current[p] ?? false),
    ).map((purpose) => ({ purpose, granted: desired[purpose] === true }));
    if (changes.length === 0) {
      return changes;
    }
    await recordConsents(tx, {
      userId: uid,
      decisions: changes,
      policyVersion: CONSENT_POLICY_VERSION,
      uiTextHash: consentTextHash(),
      userAgent,
    });
    for (const change of changes) {
      await appendAudit(tx, {
        shopId: null,
        actor: uid,
        action: change.granted ? 'consent.recorded' : 'consent.withdrawn',
        meta: { purpose: change.purpose },
      });
    }
    return changes;
  });
}

export async function hasServiceConsent(db: Db, userId: string): Promise<boolean> {
  const current = await withUserContext(db, asUserId(userId), currentConsents);
  return current.service_processing === true;
}
