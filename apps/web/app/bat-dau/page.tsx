import type { Metadata } from 'next';
import { noIndex } from '../../lib/site';
import { redirect } from 'next/navigation';
import { t } from '../../lib/messages';
import { myShops, requireConsentedUser } from '../../server/session';
import { createDemoShopAction } from './actions';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = { title: t.onboarding.title, ...noIndex };

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await requireConsentedUser();
  if ((await myShops(user.id)).length > 0) {
    redirect('/tong-quan');
  }
  return (
    <main>
      <h1>{t.onboarding.title}</h1>
      <p>{t.onboarding.intro}</p>
      <OnboardingForm />
      <section className="notice" aria-labelledby="demo-title" style={{ marginTop: 24 }}>
        <h2 id="demo-title">{t.onboarding.demoTitle}</h2>
        <p>{t.onboarding.demoBody}</p>
        <form action={createDemoShopAction}>
          <button type="submit" className="secondary">{t.onboarding.demoSubmit}</button>
        </form>
      </section>
    </main>
  );
}
