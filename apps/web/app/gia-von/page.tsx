import { appDb } from '@sa/db';
import { asIsoDate, formatDate, formatVnd, toIctDate } from '@sa/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fill, t } from '../../lib/messages';
import { noIndex } from '../../lib/site';
import { listCosts } from '../../server/costs';
import { requireShop } from '../../server/session';
import { CostRow } from './cost-row';

export const metadata: Metadata = { title: t.costs.title, ...noIndex };

export const dynamic = 'force-dynamic';

const plain = (n: bigint | null) => (n === null ? '' : formatVnd(n).replace(/\s₫$/u, ''));

export default async function CostsPage() {
  const { user, shop } = await requireShop();
  const costs = await listCosts(appDb(), { userId: user.id, shopId: shop.id }, toIctDate(new Date()));
  const missing = costs.filter((c) => c.cogsVnd === null).length;
  return (
    <main className="stack">
      <h1>{t.costs.title}</h1>
      <p>{t.costs.intro}</p>
      {costs.length === 0 ? (
        <p>{t.costs.empty}</p>
      ) : (
        <>
          {missing > 0 && <p className="notice">{fill(t.costs.missingCount, { n: missing })}</p>}
          <p className="muted">
            {t.costs.bulkHint} <a href="/mau/gia-von" download>{t.upload.costTemplate}</a> · <Link href="/tai-len">{t.dashboard.uploadLink}</Link>
          </p>
          {costs.map((c) => (
            <CostRow
              key={c.skuId}
              skuId={c.skuId}
              label={c.variation ? `${c.name} - ${c.variation}` : c.name}
              note={c.cogsVnd === null || !c.effectiveFrom ? t.costs.missing : `${formatVnd(c.cogsVnd)} · ${fill(t.costs.since, { date: formatDate(asIsoDate(c.effectiveFrom)) })}`}
              cogs={plain(c.cogsVnd)}
              packaging={plain(c.packagingVnd)}
            />
          ))}
        </>
      )}
      <Link href="/tong-quan">{t.costs.backLink}</Link>
    </main>
  );
}
