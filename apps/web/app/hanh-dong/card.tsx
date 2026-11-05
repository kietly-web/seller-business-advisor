import type { RunCard } from '@sa/db';
import { CHECKLISTS } from '@sa/engine';
import { formatVndCompact } from '@sa/shared';
import Link from 'next/link';
import { fill, t } from '../../lib/messages';
import { decideAction, rateAction } from './actions';

const REASONS = Object.keys(t.actions.reasons) as (keyof typeof t.actions.reasons)[];

function impactText(card: RunCard): string {
  const vars = { low: formatVndCompact(card.impactLowVnd), high: formatVndCompact(card.impactHighVnd) };
  const kind = card.textVi.impact_kind;
  return fill(kind === 'cash' ? t.actions.impactCash : kind === 'avoided_loss' ? t.actions.impactAvoided : t.actions.impactMargin, vars);
}

// All card text renders as plain React text, never HTML (CLAUDE.md apps/web rules)
export function ActionCard({ card }: { card: RunCard }) {
  const open = card.status === 'shown' || card.status === 'accepted';
  const checklist = card.textVi.checklist.length > 0 ? card.textVi.checklist : (CHECKLISTS[`${card.actionType}.v1` as keyof typeof CHECKLISTS] ?? []);
  return (
    <article className="notice stack" aria-labelledby={`card-${card.id}`}>
      <div className="row">
        <span className="badge">{card.rank}</span>
        <span className="muted">{t.actions.status[card.status]}</span>
      </div>
      <h2 id={`card-${card.id}`}>{card.textVi.title}</h2>
      <p className="muted">{card.textSource === 'llm' ? t.actions.aiLabelLlm : t.actions.aiLabelTemplate}</p>
      <p>{card.textVi.body}</p>
      <p className="muted">{card.textVi.why_now}</p>
      <p><strong>{impactText(card)}</strong> · {t.actions.confidence[card.confidence]}</p>
      <details>
        <summary>{t.actions.checklistTitle}</summary>
        <ol>{checklist.map((step) => <li key={step}>{step}</li>)}</ol>
      </details>
      {card.evidence.length > 0 && (
        <details>
          <summary>{t.actions.evidenceTitle}</summary>
          <ul>
            {card.evidence.map((e) => (
              <li key={`${e.table}-${e.isoWeek}`}>
                {e.table === 'sku_week_metric' ? (
                  <Link href={`/loi-nhuan/${e.skuId}?tuan=${e.isoWeek}`}>{fill(t.actions.evidenceWeek, { n: Number(e.isoWeek.slice(6)) })}</Link>
                ) : (
                  t.actions.evidenceStock
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {open && (
        <div className="stack">
          <div className="row">
            {card.status === 'shown' && (
              <form action={decideAction}>
                <input type="hidden" name="recommendationId" value={card.id} />
                <button type="submit" name="action" value="accept">{t.actions.accept}</button>
              </form>
            )}
            <form action={decideAction}>
              <input type="hidden" name="recommendationId" value={card.id} />
              <button type="submit" name="action" value="done" className="secondary">{t.actions.done}</button>
            </form>
          </div>
          <form action={decideAction} className="week-form">
            <input type="hidden" name="recommendationId" value={card.id} />
            <input type="hidden" name="action" value="dismiss" />
            <label>
              {t.actions.dismissReason}
              <select name="reason" defaultValue="not_relevant">
                {REASONS.map((r) => <option key={r} value={r}>{t.actions.reasons[r]}</option>)}
              </select>
            </label>
            <button type="submit" className="secondary">{t.actions.dismiss}</button>
          </form>
        </div>
      )}
      {card.status === 'done' && <p className="muted">{t.actions.doneNote}</p>}
      {card.status !== 'expired' && (
        card.rating ? (
          <p className="muted">{t.actions.rated} {fill(t.actions.rateValue, { n: card.rating })}</p>
        ) : (
          <form action={rateAction} className="stack">
            <input type="hidden" name="recommendationId" value={card.id} />
            <span>{t.actions.rateTitle}</span>
            <div className="row">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="submit" name="rating" value={n} className="secondary" aria-label={fill(t.actions.rateValue, { n })}>{n}</button>
              ))}
            </div>
          </form>
        )
      )}
    </article>
  );
}
