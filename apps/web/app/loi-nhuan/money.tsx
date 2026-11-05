import { formatPercent, formatVnd } from '@sa/shared';
import { t } from '../../lib/messages';

export function Money({ value }: { value: bigint | null }) {
  if (value === null) return <span className="muted">{t.profit.costMissing}</span>;
  return <span className={value < 0n ? 'negative' : undefined}>{formatVnd(value)}</span>;
}

export function Pct({ value }: { value: number | null }) {
  if (value === null) return null;
  return <span className={value < 0 ? 'negative' : 'muted'}>{formatPercent(value)}</span>;
}
