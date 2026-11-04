const NBSP = ' ';
const MILLION = 1_000_000n;
const BILLION = 1_000_000_000n;
const CURRENCY_TOKENS = /₫|vnđ|vnd|đ/giu;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

export function formatVnd(amount: bigint): string {
  const sign = amount < 0n ? '-' : '';
  return `${sign}${groupThousands(abs(amount).toString())}${NBSP}₫`;
}

function scaled(magnitude: bigint, unit: bigint): { whole: bigint; tenth: bigint } {
  const tenths = (magnitude * 10n + unit / 2n) / unit;
  return { whole: tenths / 10n, tenth: tenths % 10n };
}

function withUnit(sign: string, whole: bigint, tenth: bigint, unit: string): string {
  const decimal = tenth === 0n ? '' : `,${tenth}`;
  return `${sign}${groupThousands(whole.toString())}${decimal}${NBSP}${unit}${NBSP}₫`;
}

export function formatVndCompact(amount: bigint): string {
  const magnitude = abs(amount);
  if (magnitude < 100_000n) {
    return formatVnd(amount);
  }
  const sign = amount < 0n ? '-' : '';
  const millions = scaled(magnitude, MILLION);
  if (millions.whole < 1000n) {
    return withUnit(sign, millions.whole, millions.tenth, 'triệu');
  }
  const billions = scaled(magnitude, BILLION);
  return withUnit(sign, billions.whole, billions.tenth, 'tỷ');
}

const GROUPED_DOT = /^\d{1,3}(\.\d{3})+$/;
const GROUPED_COMMA = /^\d{1,3}(,\d{3})+$/;
const PLAIN = /^\d+$/;
const ZERO_FRACTION = /^(\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+)[.,]0{1,2}$/;

export function parseVnd(input: string): bigint | null {
  const compact = input.replace(CURRENCY_TOKENS, '').replace(/\s/gu, '');
  const negative = compact.startsWith('-');
  const body = negative ? compact.slice(1) : compact;

  let digits: string | null = null;
  if (PLAIN.test(body)) {
    digits = body;
  } else if (GROUPED_DOT.test(body) || GROUPED_COMMA.test(body)) {
    digits = body.replace(/[.,]/g, '');
  } else {
    const m = ZERO_FRACTION.exec(body);
    const whole = m?.[1];
    if (whole !== undefined && (PLAIN.test(whole) || separatorDiffersFromFraction(body, whole))) {
      digits = whole.replace(/[.,]/g, '');
    }
  }
  if (digits === null) {
    return null;
  }
  const value = BigInt(digits);
  return negative ? -value : value;
}

function separatorDiffersFromFraction(body: string, whole: string): boolean {
  return body.charAt(whole.length) !== whole.charAt(whole.length - 4);
}
