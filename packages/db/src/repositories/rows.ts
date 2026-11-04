export function rowsOf<T>(result: unknown): T[] {
  if (typeof result === 'object' && result !== null && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  throw new TypeError('Unexpected query result shape');
}
