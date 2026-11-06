'use client';

import { useState } from 'react';
import { t } from '../../lib/messages';

// New Google users land on the consent gate first (/dong-y): consents are never implied by signing in
export function GoogleButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: '/bat-dau', newUserCallbackURL: '/dong-y', errorCallbackURL: '/dang-nhap' }),
      });
      const body = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && body?.url?.startsWith('https://accounts.google.com/')) {
        window.location.assign(body.url);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setPending(false);
  }

  return (
    <div className="stack">
      <button type="button" onClick={() => void start()} disabled={pending}>{t.signIn.google}</button>
      {failed && <p className="form-error" role="alert">{t.signIn.googleError}</p>}
    </div>
  );
}
