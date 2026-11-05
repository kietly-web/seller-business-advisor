import { z } from 'zod';
import type { CardFailure, CardText, ExplainCardInput } from './types';

export const outputCard = z.object({
  ref: z.string(),
  title: z.string(),
  body: z.string(),
  why_now: z.string(),
});

export const explainOutput = z.object({ cards: z.array(outputCard) });

export type OutputCard = z.infer<typeof outputCard>;

const LIMITS: Readonly<Record<keyof CardText, number>> = { title: 90, body: 400, why_now: 160 };
const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;
const BANNED = ['chắc chắn', 'đảm bảo', 'cam kết', 'tự động', 'chắc ăn', 'không thể sai'];
// Letters only Vietnamese uses (beyond plain ASCII); English output has none of them
const VIETNAMESE_LETTER = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/giu;

export function checkCard(card: OutputCard, input: ExplainCardInput): CardFailure | null {
  const fields: (keyof CardText)[] = ['title', 'body', 'why_now'];
  for (const field of fields) {
    const text = card[field];
    if (text.length === 0 || text.length > LIMITS[field]) return 'too_long';
    for (const m of text.matchAll(PLACEHOLDER)) {
      if (!Object.hasOwn(input.facts, m[1] ?? '')) return 'unknown_placeholder';
    }
    const stripped = text.replace(PLACEHOLDER, '');
    if (/[{}]/.test(stripped)) return 'unknown_placeholder';
    if (/\d/.test(stripped)) return 'stray_digit';
    if (/[<>]/.test(stripped)) return 'markup';
    const lower = stripped.toLocaleLowerCase('vi-VN');
    if (BANNED.some((b) => lower.includes(b)) || lower.includes('%')) return 'banned_phrase';
  }
  const all = fields.map((f) => card[f].replace(PLACEHOLDER, '')).join(' ');
  const letters = (all.match(/\p{L}/gu) ?? []).length;
  const vietnamese = (all.match(VIETNAMESE_LETTER) ?? []).length;
  if (letters > 0 && vietnamese / letters < 0.08) return 'not_vietnamese';
  return null;
}

export function fillCard(card: OutputCard, facts: Readonly<Record<string, string>>): CardText {
  const fill = (t: string) => t.replace(PLACEHOLDER, (match, key: string) => facts[key] ?? match);
  return { title: fill(card.title), body: fill(card.body), why_now: fill(card.why_now) };
}
