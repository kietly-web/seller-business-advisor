'use client';

import { useActionState } from 'react';
import { t } from '../../lib/messages';
import { refreshAction, type RefreshState } from './actions';

const initial: RefreshState = { status: 'idle' };

export function RefreshButton() {
  const [state, action, pending] = useActionState(refreshAction, initial);
  return (
    <form action={action} className="stack">
      <button type="submit" className="secondary" disabled={pending}>{pending ? t.actions.refreshing : t.actions.refresh}</button>
      <span className="muted" role="status">{state.status === 'rate_limited' ? t.actions.rateLimited : t.actions.refreshHint}</span>
    </form>
  );
}
