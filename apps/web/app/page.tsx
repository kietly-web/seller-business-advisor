import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../lib/messages';
import { getOptionalSessionUser } from '../server/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  if (await getOptionalSessionUser()) {
    redirect('/tong-quan');
  }
  return (
    <main className="stack">
      <p className="muted">{t.app.name}</p>
      <h1>{t.home.heading}</h1>
      <p>{t.home.lead}</p>
      <div className="row">
        <Link className="button" href="/dang-ky">{t.home.signUp}</Link>
        <Link className="button secondary" href="/dang-nhap">{t.home.signIn}</Link>
      </div>

      <section aria-labelledby="benefits">
        <h2 id="benefits">{t.home.benefitsTitle}</h2>
        <ul>
          {t.home.benefits.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section aria-labelledby="steps">
        <h2 id="steps">{t.home.stepsTitle}</h2>
        <ol>
          {t.home.steps.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>

      <section aria-labelledby="privacy" className="notice">
        <h2 id="privacy">{t.home.privacyTitle}</h2>
        <p>{t.home.privacy}</p>
        <p className="muted">{t.home.aiNote}</p>
      </section>
    </main>
  );
}
