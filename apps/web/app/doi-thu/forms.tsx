'use client';

import { useActionState } from 'react';
import { t } from '../../lib/messages';
import { addListingAction, addObservationAction, type CompetitorFormState } from './actions';

const initial: CompetitorFormState = { status: 'idle' };

function Status({ state, id }: { state: CompetitorFormState; id: string }) {
  return (
    <span id={id} role="status">
      {state.status === 'error' && <span className="field-error">{t.competitors.errors[state.error ?? 'generic']}</span>}
      {state.status === 'saved' && <span className="muted">{t.competitors.saved}</span>}
    </span>
  );
}

export function ListingForm({ skus }: { skus: { skuId: string; label: string }[] }) {
  const [state, action, pending] = useActionState(addListingAction, initial);
  return (
    <form action={action} noValidate>
      <label>
        {t.competitors.product}
        <select name="skuId" required defaultValue="">
          <option value="" disabled>—</option>
          {skus.map((s) => <option key={s.skuId} value={s.skuId}>{s.label}</option>)}
        </select>
      </label>
      <label>
        {t.competitors.url}
        <input type="text" name="url" inputMode="url" maxLength={500} required placeholder="https://shopee.vn/..." aria-describedby="listing-status" />
      </label>
      <label>
        {t.competitors.label}
        <input type="text" name="label" maxLength={80} />
      </label>
      <button type="submit" disabled={pending}>{t.competitors.save}</button>
      <Status state={state} id="listing-status" />
    </form>
  );
}

export function ObservationForm({ listingId, today }: { listingId: string; today: string }) {
  const [state, action, pending] = useActionState(addObservationAction, initial);
  const statusId = `obs-status-${listingId}`;
  return (
    <form action={action} noValidate>
      <input type="hidden" name="listingId" value={listingId} />
      <div className="row">
        <label>
          {t.competitors.price}
          <input type="text" name="price" inputMode="numeric" required aria-describedby={statusId} />
        </label>
        <label>
          {t.competitors.observedOn}
          <input type="date" name="observedOn" defaultValue={today} max={today} required />
        </label>
      </div>
      <label>
        {t.competitors.note}
        <input type="text" name="note" maxLength={200} />
      </label>
      <button type="submit" className="secondary" disabled={pending}>{t.competitors.addPrice}</button>
      <Status state={state} id={statusId} />
    </form>
  );
}
