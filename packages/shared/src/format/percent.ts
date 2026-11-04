export function formatPercent(fraction: number, maxDecimals = 1): string {
  if (!Number.isFinite(fraction)) {
    throw new RangeError('formatPercent expects a finite number');
  }
  const factor = 10 ** maxDecimals;
  const magnitude = Math.round(Math.abs(fraction) * 100 * factor) / factor;
  const sign = fraction < 0 && magnitude !== 0 ? '-' : '';
  const fixed = magnitude.toFixed(maxDecimals);
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  const text = trimmed.replace('.', ',');
  return `${sign}${text}%`;
}
