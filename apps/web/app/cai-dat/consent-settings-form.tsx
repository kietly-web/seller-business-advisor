'use client';

import { useActionState } from 'react';
import { t } from '../../lib/messages';
import { saveConsentsAction, type ConsentSettingsState } from './actions';

export function ConsentSettingsForm({ benchmarking, marketing }: { benchmarking: boolean; marketing: boolean }) {
  const [state, action, pending] = useActionState<ConsentSettingsState, FormData>(saveConsentsAction, { saved: false });
  return (
    <form action={action}>
      <label className="check">
        <input type="checkbox" name="anonymised_benchmarking" defaultChecked={benchmarking} />
        <span>{t.consents.anonymised_benchmarking}</span>
      </label>
      <label className="check">
        <input type="checkbox" name="marketing" defaultChecked={marketing} />
        <span>{t.consents.marketing}</span>
      </label>
      <button type="submit" disabled={pending}>{t.settings.save}</button>
      <p role="status" className="muted">{state.saved ? t.settings.saved : ''}</p>
    </form>
  );
}
