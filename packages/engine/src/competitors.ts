export const MIN_COMPETITOR_LISTINGS = 2;

/** Median of each listing's latest price (05: competitor_median); null below two listings. */
export function competitorMedian(latestPrices: readonly bigint[]): { medianVnd: bigint; listings: number } | null {
  if (latestPrices.length < MIN_COMPETITOR_LISTINGS) return null;
  const sorted = [...latestPrices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? (sorted[mid] as bigint) : ((sorted[mid - 1] as bigint) + (sorted[mid] as bigint)) / 2n;
  return { medianVnd: median, listings: sorted.length };
}
