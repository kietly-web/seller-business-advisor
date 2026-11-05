'use server';

import { appDb } from '@sa/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { t } from '../../lib/messages';
import { hasServiceConsent, recordSignUpConsents } from '../../server/consents';
import { requireUser } from '../../server/session';

export interface ConsentGateState {
  error: string | null;
}

export async function giveConsentsAction(_prev: ConsentGateState, form: FormData): Promise<ConsentGateState> {
  const user = await requireUser();
  const db = appDb();
  if (!(await hasServiceConsent(db, user.id))) {
    const choices = {
      service_processing: form.get('service_processing') === 'on',
      anonymised_benchmarking: form.get('anonymised_benchmarking') === 'on',
      marketing: form.get('marketing') === 'on',
    };
    if (!choices.service_processing) {
      return { error: t.errors.serviceConsentRequired };
    }
    await recordSignUpConsents(db, user.id, choices, (await headers()).get('user-agent'));
  }
  redirect('/bat-dau');
}
