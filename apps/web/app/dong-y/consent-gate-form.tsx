'use client';

import { useActionState } from 'react';
import { t } from '../../lib/messages';
import { giveConsentsAction, type ConsentGateState } from './actions';

export function ConsentGateForm() {
  const [state, action, pending] = useActionState<ConsentGateState, FormData>(giveConsentsAction, { error: null });
  return (
    <form action={action}>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <fieldset aria-describedby="gate-hint">
        <legend>{t.signUp.consentsLegend}</legend>
        <p id="gate-hint" className="muted">{t.signUp.consentsHint}</p>
        <label className="check">
          <input type="checkbox" name="service_processing" required />
          <span>{t.consents.service_processing}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="anonymised_benchmarking" />
          <span>{t.consents.anonymised_benchmarking}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="marketing" />
          <span>{t.consents.marketing}</span>
        </label>
      </fieldset>
      <button type="submit" disabled={pending}>{t.consentGate.submit}</button>
    </form>
  );
}
