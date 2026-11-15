'use client';
import { useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, FileUp, HelpCircle } from 'lucide-react';
import { QUESTION_TYPE } from '@/lib/labels';
import type { QuestionDraft } from '@/lib/types';
import type { ImportResult } from '@/lib/test-import';
import { dataUrlToFile, downloadCsvTemplate, IMPORT_ACCEPT, IMPORT_MAX_MB, readImportFile } from '@/lib/test-import-read';
import { uploadTaskFile } from '@/lib/files';
import { humanError } from '@/lib/errors';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge, Spinner } from '@/components/ui/misc';

export type ImportedDraft = { draft: QuestionDraft; issues: string[] };

/**
 * Тестті файлдан импорттау терезесі.
 * Файл браузерде оқылады → куратор нәтижені көреді (танылған/түзетуді қажет ететін/оқылмаған)
 * → «Редакторға қосу» басқанда сұрақтар тест құрастырушыға қосылады. Оқушыға ештеңе жіберілмейді.
 */
export function TestImportDialog({ uid, onClose, onApply }: {
  uid: string; onClose: () => void; onApply: (items: ImportedDraft[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [help, setHelp] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined | null) => {
    if (!f) return;
    setFile(f); setRes(null); setErr(null); setBusy(true);
    try {
      const r = await readImportFile(f);
      if (r.fatal) setErr(r.fatal);
      setRes(r);
    } catch (e) {
      setErr(e instanceof Error && !('code' in e) ? e.message : humanError(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const flagged = res?.questions.filter((q) => q.issues.length).length ?? 0;
  const ok = (res?.questions.length ?? 0) - flagged;

  const apply = async () => {
    if (!res) return;
    const out: ImportedDraft[] = [];
    const withImg = res.questions.filter((q) => q.images.length).length;
    let done = 0;
    for (const q of res.questions) {
      const issues = [...q.issues];
      const draft = { ...q.draft };
      if (q.images.length) {
        setApplying(`Суреттер жүктелуде: ${done + 1} / ${withImg}`);
        const f = dataUrlToFile(q.images[0], `import-${draft.key}`);
        if (!f) issues.push('Сурет форматы қолдау таппайды — суретті қолмен тіркеңіз.');
        else if (f.size > 10 * 1024 * 1024) issues.push('Сурет 10 МБ-тан үлкен — кішірейтіп, қолмен тіркеңіз.');
        else {
          try { draft.image_path = (await uploadTaskFile(uid, `q-${draft.key}`, f, () => undefined)).storage_path; }
          catch (e) { issues.push(`Сурет жүктелмеді: ${humanError(e)}`); }
        }
        if (q.images.length > 1) issues.push('Сұрақта бірнеше сурет бар — тек біріншісі алынды.');
        done++;
      }
      if (draft.qtype === 'image' && !draft.image_path && !issues.some((x) => x.includes('сурет'))) issues.push('Сурет тіркеңіз.');
      out.push({ draft, issues });
    }
    setApplying(null);
    onApply(out);
  };

  return (
    <Modal open onClose={applying ? () => undefined : onClose} size="lg" title="Тестті файлдан импорттау"
      subtitle="DOCX, XLSX, CSV немесе PDF · сұрақтар алдымен редакторда тексеріледі"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={!!applying}>Бас тарту</Button>
        <Button onClick={apply} disabled={!res?.questions.length || busy} loading={!!applying} data-testid="import-apply">
          <CheckCircle2 className="size-4" /> Редакторға қосу{res?.questions.length ? ` (${res.questions.length})` : ''}
        </Button>
      </>}>
      <div className="space-y-4">
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
          className={clsx('flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors',
            drag ? 'border-brand-700 bg-brand-50' : 'border-line bg-white hover:border-brand-300')}>
          <input ref={input} type="file" accept={IMPORT_ACCEPT} className="sr-only" data-testid="import-file"
            onChange={(e) => pick(e.target.files?.[0])} aria-label="Импорт файлы" />
          {busy ? <Spinner /> : <FileUp className="size-7 text-brand-900" />}
          <span className="text-sm font-bold text-ink">{busy ? 'Файл оқылып жатыр…' : file ? file.name : 'Файлды таңдаңыз немесе осында сүйреңіз'}</span>
          <span className="text-xs text-muted">DOCX, XLSX, CSV, PDF · {IMPORT_MAX_MB} МБ-қа дейін · файл серверге жіберілмей, браузерде оқылады</span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={downloadCsvTemplate}><Download className="size-4" /> CSV үлгісі</Button>
          <a href="/templates/komekshi-test-ulgi.xlsx" download className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold text-ink ring-1 ring-line hover:bg-brand-50">
            <FileSpreadsheet className="size-4" /> XLSX үлгісі</a>
          <a href="/templates/komekshi-test-ulgi.docx" download className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold text-ink ring-1 ring-line hover:bg-brand-50">
            <FileText className="size-4" /> DOCX үлгісі</a>
          <button type="button" onClick={() => setHelp((v) => !v)} aria-expanded={help}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50">
            <HelpCircle className="size-4" /> Файл қалай жазылады?
          </button>
        </div>
        {help && <FormatHelp />}

        {err && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}

        {res && res.questions.length > 0 && (
          <div className="space-y-3" data-testid="import-summary">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat n={res.questions.length} label="сұрақ табылды" />
              <Stat n={ok} label="дайын" tone="ok" />
              <Stat n={flagged + res.unread.length} label="түзету қажет" tone={flagged + res.unread.length ? 'bad' : undefined} />
            </div>
            <ol className="space-y-2">
              {res.questions.map((q, i) => (
                <li key={q.draft.key} className={clsx('rounded-2xl p-3 ring-1', q.issues.length ? 'bg-bad-soft/40 ring-bad/25' : 'bg-white ring-line')} data-testid="import-item">
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-900 text-xs font-bold text-white">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="brand">{QUESTION_TYPE[q.draft.qtype].label}</Badge>
                        <span className="text-[11px] text-muted">{q.source}</span>
                        {q.images.length > 0 && <Badge>сурет</Badge>}
                        {!q.issues.length && <Badge tone="ok">дайын</Badge>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink">{q.draft.prompt || '— сұрақ мәтіні жоқ —'}</p>
                      <Preview d={q.draft} />
                      {q.issues.map((x) => <p key={x} className="mt-1 flex gap-1.5 text-xs text-bad"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{x}</p>)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {res.unread.length > 0 && (
              <div className="rounded-2xl bg-warn-soft p-3 text-xs text-warn" data-testid="import-unread">
                <p className="font-bold">Оқылмаған жолдар ({res.unread.length}) — ешбір сұраққа жатқызылмады:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{res.unread.slice(0, 20).map((x, i) => <li key={i}>{x.slice(0, 160)}</li>)}</ul>
              </div>
            )}
            {applying && <p className="text-sm text-muted">{applying}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className={clsx('rounded-2xl px-2 py-3 ring-1', tone === 'bad' ? 'bg-bad-soft text-bad ring-bad/20' : tone === 'ok' ? 'bg-ok-soft text-ok ring-ok/20' : 'bg-white text-ink ring-line')}>
      <p className="text-xl font-extrabold">{n}</p>
      <p className="text-[11px] font-semibold">{label}</p>
    </div>
  );
}

/** Импортталған сұрақтың жауаптарын қысқаша көрсету */
function Preview({ d }: { d: QuestionDraft }) {
  if (d.qtype === 'matching') {
    return (
      <ul className="mt-1 space-y-0.5 text-xs text-muted">
        {d.left.map((l) => <li key={l.id}>{l.text} → <b className="text-ink">{d.right.find((r) => r.id === d.pairs[l.id])?.text ?? '?'}</b></li>)}
      </ul>
    );
  }
  if (d.qtype === 'ordering') return <p className="mt-1 text-xs text-muted">Дұрыс рет: {d.options.map((o) => o.text).join(' → ')}</p>;
  return (
    <ul className="mt-1 flex flex-wrap gap-1 text-xs">
      {d.options.map((o) => (
        <li key={o.id} className={clsx('rounded-full px-2 py-0.5', d.correct.includes(o.id) ? 'bg-ok-soft font-bold text-ok' : 'bg-mist text-muted')}>
          {d.correct.includes(o.id) && '✓ '}{o.text}
        </li>
      ))}
    </ul>
  );
}

function FormatHelp() {
  return (
    <div className="space-y-3 rounded-2xl bg-mist p-4 text-xs leading-relaxed text-ink">
      <div>
        <p className="font-bold">XLSX / CSV (кесте)</p>
        <p className="text-muted">Бірінші жол — баған атаулары: <b>Түрі, Сұрақ, Мәтін, A, B, C, D, E, Дұрыс жауап, Түсіндірме, Ұпай</b>. Әр жол — бір сұрақ.</p>
        <ul className="mt-1 list-disc pl-4 text-muted">
          <li>Түрі: бір жауапты, бірнеше жауапты, сәйкестендіру, реттеу, мәтін, сурет.</li>
          <li>Дұрыс жауап: <b>A</b> немесе бірнеше болса <b>A, C</b>.</li>
          <li>Сәйкестендіру: әр ұяшыққа <b>Абай — Қара сөздер</b> түрінде дұрыс жұп жазылады.</li>
          <li>Реттеу: нұсқаларды дұрыс ретпен жазыңыз (немесе «Дұрыс жауап» бағанында <b>B, A, C</b>).</li>
        </ul>
      </div>
      <div>
        <p className="font-bold">DOCX / PDF (мәтін)</p>
        <pre className="mt-1 overflow-x-auto rounded-xl bg-white p-3 font-mono text-[11px] whitespace-pre-wrap text-ink ring-1 ring-line">{`1. Қазақ хандығы қай жылы құрылды?
A) 1465
B) 1511
Жауабы: A
Түсіндірме: Керей мен Жәнібек

2. Тұлға мен еңбегін сәйкестендіріңіз
Абай — Қара сөздер
Шоқан — Жоңғария очерктері

3. Оқиғаларды хронологиялық ретпен орналастырыңыз
A) Аңырақай шайқасы
B) Қазақ хандығының құрылуы
Жауабы: B, A

Мәтін: Аңырақай шайқасы 1730 жылы болды.
4. Мәтін бойынша кім жеңді?
*A) Қазақ жасағы
B) Жоңғарлар`}</pre>
        <p className="mt-1 text-muted">Дұрыс нұсқаны <b>«Жауабы: …»</b> жолымен, нұсқа алдына <b>*</b> қойып немесе нұсқаны <b>қалың</b> етіп белгілеуге болады. DOCX-тағы суреттер сұрақпен бірге импортталады.</p>
      </div>
    </div>
  );
}
