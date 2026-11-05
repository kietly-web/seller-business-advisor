import { appDb, currentConsents, withUserContext } from '@sa/db';
import { asUserId } from '@sa/shared';
import Link from 'next/link';
import { t } from '../../lib/messages';
import { requireUser } from '../../server/session';
import { ConsentSettingsForm } from './consent-settings-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const consents = await withUserContext(appDb(), asUserId(user.id), currentConsents);
  return (
    <main>
      <h1>{t.settings.title}</h1>
      <h2>{t.settings.consentsTitle}</h2>
      <p className="muted">{t.settings.serviceNote}</p>
      <ConsentSettingsForm
        benchmarking={consents.anonymised_benchmarking ?? false}
        marketing={consents.marketing ?? false}
      />
      <p style={{ marginTop: 24 }}>
        <Link href="/tong-quan">{t.settings.backLink}</Link>
      </p>
    </main>
  );
}
