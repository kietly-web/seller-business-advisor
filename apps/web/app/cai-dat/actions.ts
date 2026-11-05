'use server';

import { appDb } from '@sa/db';
import { headers } from 'next/headers';
import { updateOptionalConsents } from '../../server/consents';
import { requireConsentedUser } from '../../server/session';

export interface ConsentSettingsState {
  saved: boolean;
}

export async function saveConsentsAction(_prev: ConsentSettingsState, form: FormData): Promise<ConsentSettingsState> {
  const user = await requireConsentedUser();
  await updateOptionalConsents(
    appDb(),
    user.id,
    {
      anonymised_benchmarking: form.get('anonymised_benchmarking') === 'on',
      marketing: form.get('marketing') === 'on',
    },
    (await headers()).get('user-agent'),
  );
  return { saved: true };
}
