import { toIctDate } from '@sa/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { t } from '../../lib/messages';
import { noIndex } from '../../lib/site';
import { requireShop } from '../../server/session';
import { UploadFlow } from './upload-flow';

export const metadata: Metadata = { title: t.upload.title, ...noIndex };

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  await requireShop();
  return (
    <main className="stack">
      <h1>{t.upload.title}</h1>
      <p>{t.upload.intro}</p>
      <UploadFlow today={toIctDate(new Date())} />
      <section className="stack">
        <h2>{t.upload.templatesTitle}</h2>
        <a href="/mau/gia-von" download>{t.upload.costTemplate}</a>
        <a href="/mau/ton-kho" download>{t.upload.stockTemplate}</a>
      </section>
      <Link href="/tong-quan">{t.upload.backLink}</Link>
    </main>
  );
}
