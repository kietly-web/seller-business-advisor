'use client';

import { chunkRecords } from '@sa/parsers';
import { formatDate, asIsoDate } from '@sa/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { fill, t } from '../../lib/messages';
import { cancelUploadAction, finishUploadAction, sendChunkAction, startUploadAction } from './actions';
import { WARN_FILE_BYTES, type FromWorker, type Inspection, type ToWorker } from './protocol';

type ErrorKey = keyof typeof t.upload.errors | 'tooLarge' | 'unknown';

type Step =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'choose'; parserIds: string[] }
  | { kind: 'review'; inspection: Inspection }
  | { kind: 'sending'; done: number; total: number }
  | { kind: 'done'; rows: number; periodFrom: string | null; periodTo: string | null; unknownSku: number; skipped: number; costMissing: number }
  | { kind: 'error'; key: ErrorKey };

const typeLabel = (exportType: string) => t.upload.types[exportType as keyof typeof t.upload.types] ?? exportType;

function errorText(key: ErrorKey): string {
  if (key === 'tooLarge') return t.upload.tooLarge;
  if (key === 'unknown') return t.upload.unknown;
  return t.upload.errors[key];
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

export function UploadFlow({ today }: { today: string }) {
  const router = useRouter();
  const worker = useRef<Worker | null>(null);
  const pending = useRef<((m: FromWorker) => void) | null>(null);
  const file = useRef<{ name: string; sha256: string; large: boolean } | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'idle' });

  useEffect(() => {
    const w = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<FromWorker>) => pending.current?.(e.data);
    worker.current = w;
    return () => w.terminate();
  }, []);

  function ask(message: ToWorker): Promise<FromWorker> {
    return new Promise((resolve) => {
      pending.current = resolve;
      worker.current?.postMessage(message);
    });
  }

  async function onFile(selected: File | undefined) {
    if (!selected) return;
    setStep({ kind: 'reading' });
    const reply = await ask({ type: 'inspect', file: selected });
    if (reply.type === 'error') return setStep({ kind: 'error', key: reply.reason });
    if (reply.type !== 'inspected') return setStep({ kind: 'error', key: 'read' });
    file.current = { name: selected.name, sha256: reply.sha256, large: selected.size > WARN_FILE_BYTES };
    const { result } = reply;
    if (result.kind === 'match') setStep({ kind: 'review', inspection: result.inspection });
    else if (result.kind === 'ambiguous') setStep({ kind: 'choose', parserIds: result.parserIds });
    else setStep({ kind: 'error', key: 'unknown' });
  }

  async function onChoose(parserId: string) {
    const reply = await ask({ type: 'choose', parserId });
    if (reply.type === 'chosen' && reply.inspection) setStep({ kind: 'review', inspection: reply.inspection });
    else setStep({ kind: 'error', key: 'unknown' });
  }

  async function onConfirm(inspection: Inspection) {
    const f = file.current;
    if (!f) return;
    let uploadId: string | null = null;
    try {
      const started = await startUploadAction({
        parserId: inspection.parserId,
        fileSha256: f.sha256,
        fileName: f.name,
        removedColumns: inspection.removedColumns,
      });
      if (!started.ok) return setStep({ kind: 'error', key: started.error });
      uploadId = started.uploadId;
      const reply = await ask({ type: 'transform', salt: started.salt, today });
      if (reply.type !== 'transformed') return setStep({ kind: 'error', key: 'read' });
      const { records, issues } = reply;
      setStep({ kind: 'sending', done: 0, total: records.length });
      let sentCount = 0;
      for (const chunk of chunkRecords(records)) {
        const id = uploadId;
        const sent = await withRetry(() => sendChunkAction(id, chunk));
        if (!sent.ok) return setStep({ kind: 'error', key: sent.error });
        sentCount += chunk.length;
        setStep({ kind: 'sending', done: sentCount, total: records.length });
      }
      const id = uploadId;
      const done = await withRetry(() => finishUploadAction(id, { expectedRecords: records.length, issues }));
      if (!done.ok) return setStep({ kind: 'error', key: done.error });
      const count = (code: string) => issues.find((x) => x.code === code)?.count ?? 0;
      setStep({
        kind: 'done',
        rows: done.rowCount,
        periodFrom: done.periodFrom,
        periodTo: done.periodTo,
        unknownSku: done.unknownSkuRows,
        costMissing: count('COST_MISSING'),
        skipped: issues.filter((x) => x.code !== 'COST_MISSING' && x.code !== 'UNKNOWN_STATUS').reduce((s, x) => s + x.count, 0),
      });
      router.refresh();
    } catch {
      if (uploadId) await cancelUploadAction(uploadId).catch(() => undefined);
      setStep({ kind: 'error', key: 'network' });
    }
  }

  const reset = () => {
    file.current = null;
    setStep({ kind: 'idle' });
  };

  return (
    <section className="stack" aria-live="polite">
      {(step.kind === 'idle' || step.kind === 'error') && (
        <label>
          {t.upload.chooseFile}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      )}
      {step.kind === 'error' && <p className="form-error" role="alert">{errorText(step.key)}</p>}
      {step.kind === 'reading' && <p>{t.upload.reading}</p>}
      {step.kind === 'choose' && (
        <div className="stack">
          <p>{t.upload.ambiguous}</p>
          {step.parserIds.map((id) => (
            <button key={id} type="button" className="secondary" onClick={() => void onChoose(id)}>
              {typeLabel(id.split('@')[0] ?? id)}
            </button>
          ))}
          <button type="button" className="secondary" onClick={reset}>{t.upload.cancel}</button>
        </div>
      )}
      {step.kind === 'review' && (
        <div className="stack">
          <p><strong>{fill(t.upload.detected, { type: typeLabel(step.inspection.exportType) })}</strong> · {fill(t.upload.rows, { n: step.inspection.rows })}</p>
          {step.inspection.assumed && <p className="notice">{t.upload.assumedNote}</p>}
          {file.current?.large && <p className="muted">{t.upload.largeWarning}</p>}
          <ColumnList title={t.upload.mappedTitle} names={step.inspection.mapped} />
          <ColumnList title={t.upload.piiRemovedTitle} names={step.inspection.removedColumns.filter((c) => c.pii).map((c) => c.name)} />
          <ColumnList title={t.upload.otherRemovedTitle} names={step.inspection.removedColumns.filter((c) => !c.pii).map((c) => c.name)} />
          <div className="row">
            <button type="button" onClick={() => void onConfirm(step.inspection)}>{t.upload.confirm}</button>
            <button type="button" className="secondary" onClick={reset}>{t.upload.cancel}</button>
          </div>
        </div>
      )}
      {step.kind === 'sending' && (
        <div className="stack">
          <p>{fill(t.upload.sending, { done: step.done, total: step.total })}</p>
          <progress max={step.total || 1} value={step.done} />
        </div>
      )}
      {step.kind === 'done' && (
        <div className="stack">
          <p className="notice">{fill(t.upload.done, { rows: step.rows })}</p>
          {step.periodFrom && step.periodTo && (
            <p>{fill(t.upload.period, { from: formatDate(asIsoDate(step.periodFrom)), to: formatDate(asIsoDate(step.periodTo)) })}</p>
          )}
          {step.unknownSku > 0 && <p>{fill(t.upload.unknownSku, { n: step.unknownSku })}</p>}
          {step.costMissing > 0 && <p>{fill(t.upload.costMissing, { n: step.costMissing })}</p>}
          {step.skipped > 0 && <p>{fill(t.upload.skipped, { n: step.skipped })}</p>}
          <button type="button" className="secondary" onClick={reset}>{t.upload.another}</button>
        </div>
      )}
    </section>
  );
}

function ColumnList({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <details>
      <summary>{title} ({names.length})</summary>
      <ul>{names.map((n, i) => <li key={`${i}-${n}`}>{n}</li>)}</ul>
    </details>
  );
}
