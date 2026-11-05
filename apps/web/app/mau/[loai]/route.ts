import { appDb } from '@sa/db';
import { toIctDate } from '@sa/shared';
import { templateCsv } from '../../../server/costs';
import { requireShop } from '../../../server/session';

const FILES = { 'gia-von': 'mau-gia-von.csv', 'ton-kho': 'mau-ton-kho.csv' } as const;

export async function GET(_request: Request, { params }: { params: Promise<{ loai: string }> }) {
  const { loai } = await params;
  if (loai !== 'gia-von' && loai !== 'ton-kho') {
    return new Response(null, { status: 404 });
  }
  const { user, shop } = await requireShop();
  const csv = await templateCsv(appDb(), { userId: user.id, shopId: shop.id }, loai, toIctDate(new Date()));
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${FILES[loai]}"`,
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}
