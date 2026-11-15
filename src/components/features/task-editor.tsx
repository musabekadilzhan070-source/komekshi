'use client';
import { useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  BookOpenText, ClipboardPen, ExternalLink, FileUp, ListChecks, MessageCircleQuestion, NotebookPen, Plus, Send, Table2, Trash2, Video, X,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { addDays, daysBetween, MONTHS, periodOf, periodWeekLabel, todayISO, weeksInMonth } from '@/lib/date';
import { PRIORITY, QUESTION_TYPE, TASK_KIND } from '@/lib/labels';
import { copyTaskFile, removeTaskFiles } from '@/lib/files';
import type { Priority, QuestionDraft, QuestionType, Task, TaskKind } from '@/lib/types';
import { useAccount } from '@/components/shell/account-context';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, LoadingBlock } from '@/components/ui/misc';
import { OrnamentDivider } from '@/components/ui/ornament';
import { useToast } from '@/components/ui/toast';
import { StudentMultiSelect } from './students';
import { FileList, FileUploader, type FileMeta } from './task-files';
import { draftToPayload, rowToDraft, TestBuilder } from './test-builder';

export const KIND_ICON: Record<TaskKind, React.ComponentType<{ className?: string }>> = {
  written: NotebookPen, questions: MessageCircleQuestion, essay: ClipboardPen, table: Table2, file_upload: FileUp,
  external_link: ExternalLink, video: Video, reading: BookOpenText, test: ListChecks,
};
const KINDS = Object.keys(TASK_KIND) as TaskKind[];

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <OrnamentDivider className="mb-1.5" />
        <h4 className="text-sm font-extrabold text-ink">{title}</h4>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

type Existing = Task & {
  task_attachments: FileMeta[];
  test_questions: Parameters<typeof rowToDraft>[0][];
  task_submissions: { id: string; student_id: string; status: string; answer_text: string | null; answer_data: unknown }[];
  test_attempts: { id: string; finished_at: string | null; test_version: number }[];
};

/** Тапсырма редакторы: құру және өңдеу */
export function TaskEditorModal({
  students, preselected = [], editId, copyId, onClose, onSaved,
}: {
  students: { id: string; full_name: string }[]; preselected?: string[]; editId?: string; copyId?: string;
  onClose: () => void; onSaved: () => void;
}) {
  const me = useAccount();
  const srcId = editId ?? copyId;
  const { data: loaded, loading, error } = useLoad(async () => {
    if (!srcId) return null;
    const res = await supabaseBrowser().from('tasks')
      .select('*, task_attachments(*), test_questions(*), task_submissions(id, student_id, status, answer_text, answer_data), test_attempts(id, finished_at, test_version)')
      .eq('id', srcId).order('sort_order', { referencedTable: 'test_questions' }).single();
    const t = must(res) as Existing;
    // Тек ағымдағы нұсқаның сұрақтары (бұрынғы нұсқалар нәтижелер тарихында сақталады)
    return { ...t, test_questions: t.test_questions.filter((q) => (q as { version?: number }).version === t.test_version) };
  }, [srcId]);

  if (srcId && (loading || error || !loaded)) {
    return (
      <Modal open onClose={onClose} size="xl" title={editId ? 'Тапсырманы өзгерту' : 'Тапсырманы көшіру'}>
        {error ? <p className="text-sm text-bad">{error}</p> : <LoadingBlock rows={4} />}
      </Modal>
    );
  }
  return (
    <EditorForm uid={me.id} students={students} preselected={preselected}
      existing={editId ? loaded : null} source={copyId ? loaded : null} onClose={onClose} onSaved={onSaved} />
  );
}

function EditorForm({
  uid, students, preselected, existing, source, onClose, onSaved,
}: {
  uid: string; students: { id: string; full_name: string }[]; preselected: string[]; existing: Existing | null;
  source?: Existing | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const today = todayISO();
  const folder = useRef(`att-${crypto.randomUUID().slice(0, 8)}`).current;
  const edit = !!existing;
  const base = existing ?? source ?? null;

  const [kind, setKind] = useState<TaskKind>(base?.kind ?? 'written');
  const [f, setF] = useState({
    title: existing ? existing.title : source ? `${source.title} (көшірме)`.slice(0, 200) : '',
    description: base?.description ?? '', instructions: base?.instructions ?? '',
    start: existing?.start_date ?? today,
    due: existing?.due_date ?? (source ? addDays(today, Math.max(1, daysBetween(source.start_date, source.due_date))) : addDays(today, 7)),
    priority: (base?.priority ?? 'medium') as Priority, url: base?.external_url ?? '',
  });
  const [period, setPeriod] = useState(() => existing
    ? { year: existing.period_year, month: existing.period_month, week: existing.period_week }
    : periodOf(today));
  const maxWeek = weeksInMonth(period.year, period.month);
  const setP = (k: 'year' | 'month' | 'week', v: number) => {
    setErr(null);
    setPeriod((s) => {
      const n = { ...s, [k]: v };
      n.week = Math.min(n.week, weeksInMonth(n.year, n.month));
      return n;
    });
  };
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from(new Set([y - 1, y, y + 1, period.year])).sort();
  }, [period.year]);
  const [questions, setQuestions] = useState<string[]>(base?.config?.questions ?? ['']);
  const [columns, setColumns] = useState<string[]>(base?.config?.columns ?? ['', '']);
  const [rows, setRows] = useState<number>(base?.config?.rows ?? 5);
  const [test, setTest] = useState<QuestionDraft[]>(() => (base?.test_questions ?? []).map(rowToDraft));
  const [testDirty, setTestDirty] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(base?.time_limit_minutes ?? null);
  const [builder, setBuilder] = useState(false);
  // Көшіру кезінде түпнұсқа материалдар — «copied» белгісімен (сақтағанда жаңа жолға көшіріледі)
  const [files, setFiles] = useState<(FileMeta & { copied?: boolean })[]>(
    existing?.task_attachments ?? (source?.task_attachments ?? []).map(({ storage_path, file_name, mime_type, size_bytes }) => ({ storage_path, file_name, mime_type, size_bytes, copied: true })));
  const [removed, setRemoved] = useState<FileMeta[]>([]);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const assigned = useMemo(() => existing?.task_submissions.map((s) => s.student_id) ?? [], [existing]);
  const [ids, setIds] = useState<string[]>(edit ? assigned : source ? source.task_submissions.map((s) => s.student_id).filter((id) => students.some((x) => x.id === id)) : preselected);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retake, setRetake] = useState(false);
  const attempts = existing?.test_attempts ?? [];
  const finishedCount = attempts.filter((a) => a.finished_at).length;
  const started = attempts.length > 0;
  // Түрін өзгерту: оқушылардың ешқайсысы бастамаған болса ғана
  const kindLocked = edit && (started || existing!.task_submissions.some((s) => s.status !== 'new' || s.answer_text || s.answer_data));
  const addIds = edit ? ids.filter((id) => !assigned.includes(id)) : ids;
  const removeIds = edit ? assigned.filter((id) => !ids.includes(id)) : [];
  const nameOf = (id: string) => students.find((x) => x.id === id)?.full_name ?? 'Оқушы';

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setErr(null); setF((s) => ({ ...s, [k]: v })); };

  const cancel = () => {
    // құрылмаған тапсырмаға жүктелген файлдарды тазалау
    if (uploaded.length) removeTaskFiles(uploaded);
    onClose();
  };

  const config = () => {
    if (kind === 'questions') return { questions: questions.map((q) => q.trim()).filter(Boolean) };
    if (kind === 'table') return { columns: columns.map((c) => c.trim()).filter(Boolean), rows };
    return {};
  };

  const validate = (): string | null => {
    if (!f.title.trim()) return 'Тапсырма атауын енгізіңіз.';
    if (!f.due || f.due < f.start) return 'Соңғы мерзім басталу күнінен кейін болуы керек.';
    if ((kind === 'external_link' || kind === 'video') && !/^https?:\/\/\S+$/i.test(f.url.trim())) return 'Сілтемені https://... түрінде енгізіңіз.';
    if (kind === 'questions' && !questions.some((q) => q.trim())) return 'Кемінде бір сұрақ жазыңыз.';
    if (kind === 'table' && (!columns.some((c) => c.trim()) || rows < 1 || rows > 50)) return 'Кесте бағандарын және жол санын (1–50) көрсетіңіз.';
    if (kind === 'test' && test.length === 0) return 'Тест құрастырыңыз: кемінде бір сұрақ қосыңыз.';
    if (ids.length === 0) return edit ? 'Кемінде бір оқушы қалуы керек. Тапсырманы толық алып тастау үшін «Тапсырманы өшіру» әрекетін қолданыңыз.' : 'Кемінде бір оқушыны таңдаңыз.';
    if (uploading) return 'Файлдар жүктеліп жатыр, күте тұрыңыз.';
    return null;
  };

  const save = async () => {
    const v = validate();
    if (v) return setErr(v);
    setSaving(true);
    const sb = supabaseBrowser();
    const task = {
      title: f.title, description: f.description, instructions: f.instructions, start_date: f.start, due_date: f.due,
      priority: f.priority, kind, external_url: f.url.trim() || null, config: config(), time_limit_minutes: kind === 'test' ? minutes : null,
      period_year: period.year, period_month: period.month, period_week: period.week,
    };
    const qPayload = kind === 'test' ? test.map(draftToPayload) : null;
    try {
      if (!edit) {
        // Көшірілген материалдарды жаңа жолға көшіреміз
        const atts = [];
        for (const x of files) {
          const path = x.copied ? await copyTaskFile(x.storage_path, uid, folder) : x.storage_path;
          if (x.copied) setUploaded((s) => [...s, path]);
          atts.push({ storage_path: path, file_name: x.file_name, mime_type: x.mime_type, size_bytes: x.size_bytes });
        }
        const res = await sb.rpc('create_task_v2', { p_task: task, p_students: ids, p_questions: qPayload, p_attachments: atts });
        if (res.error) throw res.error;
        toast.success(`Тапсырма ${ids.length} оқушыға берілді`);
      } else {
        const kindChanged = kind !== existing!.kind;
        const res = await sb.rpc('update_task_v2', {
          p_task_id: existing!.id, p_task: task, p_questions: kind === 'test' && (testDirty || kindChanged) ? qPayload : null,
          p_add_students: addIds.length ? addIds : null, p_remove_students: removeIds.length ? removeIds : null,
          p_retake: retake,
        });
        if (res.error) throw res.error;
        const added = files.filter((x) => !x.id);
        if (added.length) {
          const r = await sb.from('task_attachments').insert(added.map((a) => ({ ...a, task_id: existing!.id })));
          if (r.error) throw r.error;
        }
        if (removed.length) {
          const r = await sb.from('task_attachments').delete().in('id', removed.map((x) => x.id!));
          if (r.error) throw r.error;
          await removeTaskFiles(removed.map((x) => x.storage_path));
        }
        const r = res.data as { new_version?: boolean; retaken?: number } | null;
        toast.success(r?.new_version
          ? (r.retaken ? `Тесттің жаңа нұсқасы сақталды. ${r.retaken} оқушы қайта тапсырады` : 'Тесттің жаңа нұсқасы сақталды. Бұрынғы нәтижелер тарихта қалды')
          : 'Өзгерістер сақталды. Оқушы кабинетінде жаңартылды');
      }
      setSaving(false);
      onSaved();
    } catch (e) {
      setSaving(false);
      setErr(humanError(e));
    }
  };

  const testSummary = useMemo(() => {
    const byType = new Map<QuestionType, number>();
    test.forEach((q) => byType.set(q.qtype, (byType.get(q.qtype) ?? 0) + 1));
    return { total: test.reduce((a, q) => a + q.points, 0), byType: [...byType.entries()] };
  }, [test]);

  return (
    <>
      <Modal
        open onClose={cancel} size="xl" title={edit ? 'Тапсырманы өзгерту' : source ? 'Тапсырманы көшіру' : 'Жаңа тапсырма'}
        subtitle={edit ? `${TASK_KIND[kind].label} · ${assigned.length} оқушы` : source ? 'Көшірменің параметрлерін тексеріп, оқушыларды таңдаңыз' : 'Түрін таңдап, мазмұнын толтырыңыз'}
        footer={<>
          <Button variant="secondary" onClick={cancel} data-testid="task-cancel">Болдырмау</Button>
          <Button onClick={save} loading={saving} disabled={uploading} data-testid="task-save"><Send className="size-4" /> {edit ? 'Сақтау' : kind === 'test' ? 'Сақтау және оқушыға жіберу' : 'Тапсырма беру'}</Button>
        </>}
      >
        <div className="space-y-7">
          {(
            <Section title="Тапсырма түрі" hint={kindLocked ? 'Оқушылар тапсырманы орындай бастаған — түрін өзгертуге болмайды. Қалған параметрлердің бәрін өзгертуге болады.' : undefined}>
              <div className={clsx('grid grid-cols-2 gap-2 sm:grid-cols-3', kindLocked && 'pointer-events-none opacity-60')} role="radiogroup" aria-label="Тапсырма түрі" aria-disabled={kindLocked || undefined}>
                {KINDS.map((k) => {
                  const Icon = KIND_ICON[k];
                  const on = kind === k;
                  return (
                    <button key={k} type="button" role="radio" aria-checked={on} disabled={kindLocked} onClick={() => { setErr(null); setKind(k); }}
                      data-testid={`kind-${k}`}
                      className={clsx('flex items-center gap-2.5 rounded-2xl p-3 text-left ring-1 transition',
                        on ? 'bg-brand-900 text-white ring-brand-900' : 'bg-white ring-line hover:ring-brand-300')}>
                      <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl', on ? 'bg-mist text-ink' : 'bg-brand-100 text-ink')}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] leading-tight font-bold">{TASK_KIND[k].label}</span>
                        <span className={clsx('block truncate text-[11px]', on ? 'text-white/70' : 'text-muted')}>{TASK_KIND[k].hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Негізгі ақпарат">
            <Field label="Тапсырма атауы" required><Input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={200} placeholder="Мысалы: Абай жолы — 3-тарау" /></Field>
            <Field label="Сипаттамасы"><Textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={8000} /></Field>
            <Field label="Орындау нұсқаулығы"><Textarea rows={2} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} maxLength={8000} placeholder="Қадамдар, бағалау критерийлері" /></Field>
          </Section>

          {(kind === 'external_link' || kind === 'video') && (
            <Section title={kind === 'video' ? 'Видео сілтемесі' : 'Сыртқы сайт'} hint={kind === 'video' ? 'YouTube сілтемесі сайт ішінде ойнатылады' : 'Оқушы осы сайтқа өтіп тапсырманы орындайды'}>
              <Field label="Сілтеме" required><Input type="url" inputMode="url" value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" maxLength={2000} /></Field>
            </Section>
          )}

          {kind === 'questions' && (
            <Section title="Сұрақтар" hint="Оқушы әр сұраққа жеке жауап жазады">
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-2.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-900 text-[11px] font-bold text-white">{i + 1}</span>
                    <Textarea rows={1} value={q} onChange={(e) => setQuestions((s) => s.map((x, j) => (j === i ? e.target.value : x)))} maxLength={1000} placeholder="Сұрақ" aria-label={`${i + 1}-сұрақ`} />
                    <button type="button" aria-label="Сұрақты өшіру" disabled={questions.length <= 1} onClick={() => setQuestions((s) => s.filter((_, j) => j !== i))}
                      className="mt-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bad-soft hover:text-bad disabled:opacity-30"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
              {questions.length < 50 && <button type="button" onClick={() => setQuestions((s) => [...s, ''])} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"><Plus className="size-4" /> Сұрақ қосу</button>}
            </Section>
          )}

          {kind === 'table' && (
            <Section title="Кесте құрылымы" hint="Оқушы осы бағандар бойынша кестені толтырады">
              <div className="flex flex-wrap gap-2">
                {columns.map((c, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-2xl bg-white py-1 pr-1 pl-3 ring-1 ring-line">
                    <input value={c} onChange={(e) => setColumns((s) => s.map((x, j) => (j === i ? e.target.value : x)))} maxLength={100}
                      placeholder={`${i + 1}-баған`} aria-label={`${i + 1}-баған атауы`} className="w-32 bg-transparent py-1.5 text-sm outline-none" />
                    <button type="button" aria-label="Бағанды өшіру" disabled={columns.length <= 1} onClick={() => setColumns((s) => s.filter((_, j) => j !== i))}
                      className="flex size-7 items-center justify-center rounded-full text-muted hover:text-bad disabled:opacity-30"><X className="size-3.5" /></button>
                  </div>
                ))}
                {columns.length < 12 && <button type="button" onClick={() => setColumns((s) => [...s, ''])} className="inline-flex items-center gap-1 rounded-2xl px-3 text-sm font-semibold text-brand-700 ring-1 ring-dashed ring-brand-300"><Plus className="size-4" /> Баған</button>}
              </div>
              <Field label="Жол саны" className="max-w-[160px]"><Input type="number" min={1} max={50} value={rows} onChange={(e) => setRows(Number(e.target.value))} /></Field>
            </Section>
          )}

          {kind === 'test' && (
            <Section title="Тест" hint="Сұрақтарды бөлек редакторда құрастырасыз, нәтиже автоматты есептеледі">
              <div className="flex flex-col gap-3 rounded-3xl bg-white p-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-bold text-ink" data-testid="test-summary">{test.length ? `${test.length} сұрақ · ${testSummary.total} ұпай` : 'Сұрақтар әлі қосылмаған'}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {minutes && <Badge tone="info">{minutes} минут</Badge>}
                    {testSummary.byType.map(([t, n]) => <Badge key={t}>{QUESTION_TYPE[t].label}: {n}</Badge>)}
                  </div>
                  {started && <p className="mt-2 text-xs text-muted">Тестті {attempts.length} оқушы бастаған. Сұрақтарды өзгертсеңіз, тесттің жаңа нұсқасы сақталады, ал бұрынғы нәтижелер тарих ретінде қалады.</p>}
                </div>
                <Button variant={test.length ? 'secondary' : 'primary'} onClick={() => setBuilder(true)} data-testid="open-builder">
                  <ListChecks className="size-4" /> {test.length ? 'Сұрақтарды өзгерту' : 'Тест құрастыру'}
                </Button>
              </div>
              {edit && testDirty && finishedCount > 0 && (
                <div className="space-y-2 rounded-2xl bg-warn-soft p-4 text-sm" data-testid="version-note">
                  <p className="font-bold text-ink">Тесттің жаңа нұсқасы сақталады</p>
                  <p className="text-xs text-ink/80">{finishedCount} оқушы бұрынғы нұсқаны тапсырып қойған. Олардың нәтижелері жойылмайды.</p>
                  <label className="flex cursor-pointer items-start gap-2.5 text-[13px] font-semibold text-ink">
                    <input type="checkbox" checked={retake} onChange={(e) => setRetake(e.target.checked)} className="mt-0.5 size-4 accent-brand-900" data-testid="retake" />
                    Тапсырған оқушыларға жаңа нұсқаны қайта тапсыруға жіберу (бұрынғы нәтиже тарихта сақталады)
                  </label>
                </div>
              )}
            </Section>
          )}

          <Section title="Материалдар" hint="PDF, Word, PowerPoint, Excel, суреттер — оқушы ашып, жүктеп ала алады">
            <FileUploader uid={uid} folder={folder} onBusyChange={setUploading}
              onUploaded={(m) => { setFiles((s) => [...s, m]); setUploaded((s) => [...s, m.storage_path]); }} />
            <FileList files={files} compact onRemove={(m) => {
              setFiles((s) => s.filter((x) => x.storage_path !== m.storage_path));
              if (m.id) setRemoved((s) => [...s, m]);
              else if (uploaded.includes(m.storage_path)) { removeTaskFiles([m.storage_path]); setUploaded((s) => s.filter((p) => p !== m.storage_path)); }
            }} />
          </Section>

          <Section title="Кезеңі" hint="Тапсырма қай айға және сол айдың қай аптасына тиесілі">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Ай" required>
                <Select value={period.month} onChange={(e) => setP('month', Number(e.target.value))} data-testid="period-month">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </Select>
              </Field>
              <Field label="Апта" required>
                <Select value={period.week} onChange={(e) => setP('week', Number(e.target.value))} data-testid="period-week">
                  {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w}>{periodWeekLabel(period.year, period.month, w)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Жыл" className="col-span-2 sm:col-span-1">
                <Select value={period.year} onChange={(e) => setP('year', Number(e.target.value))}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Мерзімі және маңыздылығы">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Басталу күні" required><Input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
              <Field label="Соңғы мерзім" required><Input type="date" value={f.due} min={f.start} onChange={(e) => set('due', e.target.value)} /></Field>
              <Field label="Маңыздылығы" className="col-span-2 sm:col-span-1">
                <Select value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
                  {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Тағайындалған оқушылар" hint={edit ? 'Белгіні алып тастасаңыз, тапсырма сол оқушыдан алынады (нәтижесі архивте сақталады). Жаңа оқушы қосуға болады.' : 'Бір немесе бірнеше оқушыға бір мезетте'}>
            <Field group label="Оқушылар" required>
              <StudentMultiSelect students={students} value={ids} onChange={(v) => { setErr(null); setIds(v); }} />
            </Field>
            {edit && (addIds.length > 0 || removeIds.length > 0) && (
              <div className="space-y-1 rounded-2xl bg-mist px-4 py-3 text-xs text-ink" data-testid="students-diff">
                {addIds.length > 0 && <p><b>Қосылады:</b> {addIds.map(nameOf).join(', ')}</p>}
                {removeIds.length > 0 && <p className="text-bad"><b>Алынады:</b> {removeIds.map(nameOf).join(', ')}</p>}
              </div>
            )}
          </Section>

          {err && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
        </div>
      </Modal>
      {builder && (
        <TestBuilder uid={uid} initial={test} initialMinutes={minutes}
          onClose={() => setBuilder(false)}
          onSave={(qs, m) => { setTest(qs); setMinutes(m); setTestDirty(true); setBuilder(false); setErr(null); }} />
      )}
    </>
  );
}
