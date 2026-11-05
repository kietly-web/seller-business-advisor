'use client';

import { useActionState } from 'react';
import { t } from '../../lib/messages';
import { saveCostAction, type CostRowState } from './actions';

const initial: CostRowState = { status: 'idle' };

export function CostRow({ skuId, label, note, cogs, packaging }: { skuId: string; label: string; note: string; cogs: string; packaging: string }) {
  const [state, action, pending] = useActionState(saveCostAction, initial);
  const errorId = `cost-error-${skuId}`;
  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="skuId" value={skuId} />
      <strong>{label}</strong>
      <span className="muted">{note}</span>
      <div className="row">
        <label>
          {t.costs.cogs}
          <input type="text" name="cogs" inputMode="numeric" defaultValue={cogs} required aria-invalid={state.status === 'invalid'} aria-describedby={errorId} />
        </label>
        <label>
          {t.costs.packaging}
          <input type="text" name="packaging" inputMode="numeric" defaultValue={packaging} />
        </label>
        <button type="submit" disabled={pending}>{t.costs.save}</button>
      </div>
      <span id={errorId} role="status">
        {state.status === 'invalid' && <span className="field-error">{t.costs.invalid}</span>}
        {state.status === 'saved' && <span className="muted">{t.costs.saved}</span>}
      </span>
    </form>
  );
}
