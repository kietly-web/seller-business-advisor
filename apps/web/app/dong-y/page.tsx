import { appDb } from '@sa/db';
import { redirect } from 'next/navigation';
import { t } from '../../lib/messages';
import { hasServiceConsent } from '../../server/consents';
import { requireUser } from '../../server/session';
import { ConsentGateForm } from './consent-gate-form';

export const dynamic = 'force-dynamic';

export default async function ConsentGatePage() {
  const user = await requireUser();
  if (await hasServiceConsent(appDb(), user.id)) {
    redirect('/bat-dau');
  }
  return (
    <main>
      <h1>{t.consentGate.title}</h1>
      <p>{t.consentGate.body}</p>
      <ConsentGateForm />
    </main>
  );
}
