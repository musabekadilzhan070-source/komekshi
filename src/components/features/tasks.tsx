'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  CalendarClock, CalendarRange, CheckCircle2, ChevronRight, ClipboardList, Copy, Eye, History, ExternalLink, ListChecks, MessageSquare, Pencil, Play, RotateCcw, Save, Trash2, Undo2,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { dateTime, MONTHS, periodShort, periodWeekLabel, shortDate, todayISO, weeksInMonth } from '@/lib/date';
import { PRIORITY, SUBMISSION_STATUS, TASK_KIND } from '@/lib/labels';
import { removeTaskFiles } from '@/lib/files';
import type { Submission, SubmissionStatus, Task, TestAttempt, TestResult } from '@/lib/types';
import { useAccount } from '@/components/shell/account-context';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingBlock, Tabs } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Checkbox, Field, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ActionMenu } from '@/components/ui/menu';
import { KIND_ICON, TaskEditorModal } from './task-editor';
import { AttachmentCount, FileList, FileUploader, type FileMeta } from './task-files';
import { TestResultView, TestRunner } from './test-runner';

type Filter = 'active' | 'review' | 'done' | 'all' | 'new' | 'progress';
const FILTERS: Record<Filter, SubmissionStatus[] | null> = {
  active: ['new', 'in_progress', 'needs_revision'],
  new: ['new'],
  progress: ['in_progress', 'needs_revision'],
  review: ['pending_review'],
  done: ['accepted'],
  all: null,
};
const OPEN: SubmissionStatus[] = ['new', 'in_progress', 'needs_revision'];
const isOverdue = (s: Pick<Submission, 'status'> & { tasks?: Pick<Task, 'due_date'> | null }) =>
  OPEN.includes(s.status) && !!s.tasks && s.tasks.due_date < todayISO();

/** Статус белгісі: түрлі түсті шағын белгі (мерзімі өткені бөлек көрсетіледі) */
export function StatusPill({ status, overdue }: { status: SubmissionStatus; overdue?: boolean }) {
  const st = overdue ? { label: 'Мерзімі өтіп кеткен', cls: 'bg-bad text-white', dot: 'bg-white' } : {
    new: { label: 'Жаңа тапсырма', cls: 'bg-info-soft text-info', dot: 'bg-info' },
    in_progress: { label: 'Орындалуда', cls: 'bg-warn-soft text-warn', dot: 'bg-warn' },
    pending_review: { label: 'Тексерілуде', cls: 'bg-brand-100 text-brand-900', dot: 'bg-brand-700' },
    accepted: { label: 'Орындалды', cls: 'bg-ok-soft text-ok', dot: 'bg-ok' },
    needs_revision: { label: 'Қайта орындау қажет', cls: 'bg-bad-soft text-bad', dot: 'bg-bad' },
  }[status];
  return (
    <span className={clsx('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap', st.cls)} data-testid="status-pill">
      <span className={clsx('size-1.5 rounded-full', st.dot)} />{st.label}
    </span>
  );
}

type Attempt = Pick<TestAttempt, 'score' | 'max_score' | 'finished_at'>;
type Row = Submission & { test_attempts: Attempt | Attempt[] | null; task_attachments?: { id: string }[] };
const attemptOf = (s: Row): Attempt | null => (Array.isArray(s.test_attempts) ? s.test_attempts[0] ?? null : s.test_attempts);

export function KindBadge({ kind }: { kind: Task['kind'] }) {
  const Icon = KIND_ICON[kind];
  return <Badge tone="brand"><Icon className="size-3" /> {TASK_KIND[kind].label}</Badge>;
}

function ScoreBadge({ a }: { a: Attempt | null }) {
  if (!a?.finished_at || a.max_score == null) return null;
  const pct = Math.round((Number(a.score) * 100) / Math.max(1, Number(a.max_score)));
  return <Badge tone={pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad'}>{Number(a.score)}/{Number(a.max_score)} · {pct}%</Badge>;
}

/** Тапсырмалар тізімі. studentId берілмесе — куратордың барлық оқушылары */
export function SubmissionList({
  studentId, mode, names, defaultFilter = 'active',
}: { studentId?: string; mode: 'student' | 'curator'; names?: Map<string, string>; defaultFilter?: Filter }) {
  const params = useSearchParams();
  const focusId = params.get('id') || params.get('review');
  const [filter, setFilter] = useState<Filter>(mode === 'student' ? 'all' : defaultFilter);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, error, loading, reload } = useLoad(async () => {
    let q = supabaseBrowser().from('task_submissions')
      .select('*, tasks(*, task_attachments(id)), test_attempts(score, max_score, finished_at)')
      .order('assigned_at', { ascending: false });
    if (studentId) q = q.eq('student_id', studentId);
    return must(await q) as Row[];
  }, [studentId]);
  useRealtime(['task_submissions', 'test_attempts'], () => reload(true), studentId ? `student_id=eq.${studentId}` : undefined);
  // Куратор тапсырманы өшіргенде оқушыға хабарлама келеді — тізімді бірден жаңартамыз
  const me = useAccount();
  useRealtime(['notifications'], () => reload(true), `user_id=eq.${me.id}`, mode === 'student');

  // Ай / апта бойынша сүзгі
  const [month, setMonth] = useState('all');
  const [week, setWeek] = useState('all');
  const months = useMemo(() => {
    const set = new Map<string, { y: number; m: number }>();
    (data ?? []).forEach((x) => { if (x.tasks) set.set(`${x.tasks.period_year}-${x.tasks.period_month}`, { y: x.tasks.period_year, m: x.tasks.period_month }); });
    return [...set.entries()].sort((a, b) => (b[1].y - a[1].y) || (b[1].m - a[1].m));
  }, [data]);
  const sel = months.find(([k]) => k === month)?.[1];
  const inPeriod = (x: Row) => !sel || (x.tasks?.period_year === sel.y && x.tasks?.period_month === sel.m
    && (week === 'all' || x.tasks?.period_week === Number(week)));
  const scoped = (data ?? []).filter(inPeriod);

  useEffect(() => {
    if (focusId && data?.some((x) => x.id === focusId)) setOpenId(focusId);
  }, [focusId, data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { active: 0, new: 0, progress: 0, review: 0, done: 0, all: scoped.length };
    scoped.forEach((s) => (Object.keys(FILTERS) as Filter[]).forEach((f) => { if (FILTERS[f]?.includes(s.status)) c[f]++; }));
    return c;
  }, [scoped]);

  // Ашық тапсырмалар алдымен (мерзімі жақыны жоғарыда), содан кейін тексерілетіндер мен орындалғандар
  const rank = (x: Row) => (OPEN.includes(x.status) ? 0 : x.status === 'pending_review' ? 1 : 2);
  const list = scoped.filter((s) => !FILTERS[filter] || FILTERS[filter]!.includes(s.status))
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === 2
      ? (b.tasks?.due_date ?? '').localeCompare(a.tasks?.due_date ?? '')
      : (a.tasks?.due_date ?? '').localeCompare(b.tasks?.due_date ?? '')));
  const open = data?.find((s) => s.id === openId) ?? null;

  return (
    <div>
      <Tabs
        className="mb-4"
        value={filter}
        onChange={setFilter}
        items={mode === 'student' ? [
          { value: 'all', label: 'Барлық тапсырмалар', count: counts.all },
          { value: 'new', label: 'Жаңа', count: counts.new },
          { value: 'progress', label: 'Орындалуда', count: counts.progress },
          { value: 'done', label: 'Орындалған', count: counts.done },
          { value: 'review', label: 'Тексерілуде', count: counts.review },
        ] : [
          { value: 'active', label: 'Орындалуда', count: counts.active },
          { value: 'review', label: 'Тексеруді күтуде', count: counts.review },
          { value: 'done', label: 'Орындалған', count: counts.done },
          { value: 'all', label: 'Барлығы', count: counts.all },
        ]}
      />
      {months.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-2" role="group" aria-label="Кезең бойынша сүзгі">
          <label className="min-w-40 flex-1 sm:flex-none">
            <span className="mb-1 block text-[11px] font-semibold text-muted">Ай</span>
            <Select value={month} onChange={(e) => { setMonth(e.target.value); setWeek('all'); }} data-testid="filter-month" aria-label="Ай бойынша сүзгі">
              <option value="all">Барлық айлар</option>
              {months.map(([k, v]) => <option key={k} value={k}>{MONTHS[v.m - 1]} {v.y}</option>)}
            </Select>
          </label>
          <label className="min-w-40 flex-1 sm:flex-none">
            <span className="mb-1 block text-[11px] font-semibold text-muted">Апта</span>
            <Select value={week} onChange={(e) => setWeek(e.target.value)} disabled={!sel} data-testid="filter-week" aria-label="Апта бойынша сүзгі">
              <option value="all">Барлық апталар</option>
              {sel && Array.from({ length: weeksInMonth(sel.y, sel.m) }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>{periodWeekLabel(sel.y, sel.m, w)}</option>
              ))}
            </Select>
          </label>
          {sel && <Button size="sm" variant="ghost" onClick={() => { setMonth('all'); setWeek('all'); }}>Тазалау</Button>}
        </div>
      )}
      {loading ? (
        <LoadingBlock rows={4} />
      ) : error ? (
        <ErrorState text={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filter === 'review' ? 'Тексеруді күтетін тапсырма жоқ' : 'Тапсырма жоқ'}
          text={mode === 'student' ? 'Куратор жаңа тапсырма бергенде осында пайда болады.' : 'Оқушыларға тапсырма беру үшін «Жаңа тапсырма» батырмасын басыңыз.'}
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {list.map((s) => (
            <TaskCard key={s.id} s={s} mode={mode} name={names?.get(s.student_id)} onOpen={() => setOpenId(s.id)} />
          ))}
        </div>
      )}
      {open && (
        <SubmissionModal
          sub={open}
          mode={mode}
          studentName={names?.get(open.student_id)}
          onClose={() => setOpenId(null)}
          onChanged={() => reload(true)}
          onDone={() => { setOpenId(null); reload(true); }}
        />
      )}
    </div>
  );
}

/** Бір тапсырманың карточкасы: атауы, қысқаша сипаттамасы, кезеңі, түрі, күндері, статусы, «Ашу» батырмасы */
function TaskCard({ s, mode, name, onOpen }: { s: Row; mode: 'student' | 'curator'; name?: string; onOpen: () => void }) {
  const t = s.tasks!;
  const overdue = isOverdue(s);
  const Icon = KIND_ICON[t.kind];
  const nFiles = (t as Task & { task_attachments?: { id: string }[] }).task_attachments?.length ?? 0;
  const done = s.status === 'accepted';
  return (
    <article data-testid="submission-card" onClick={onOpen}
      className={clsx('card flex min-w-0 cursor-pointer flex-col gap-3 p-4 transition hover:ring-brand-300 sm:p-5', done && 'bg-white/70')}>
      <div className="flex items-start gap-3">
        <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-2xl', done ? 'bg-ok-soft text-ok' : 'bg-brand-50 text-brand-900')}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <h3 className="min-w-0 text-[15px] leading-snug font-bold text-ink [overflow-wrap:anywhere]">{t.title}</h3>
            <StatusPill status={s.status} overdue={overdue} />
          </div>
          {mode === 'curator' && name && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-brand-700"><Avatar name={name} size={18} /> {name}</p>
          )}
          {t.description && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{t.description}</p>}
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-mist px-3 py-2 text-xs text-ink sm:hidden">
        <span className="font-semibold">{MONTHS[t.period_month - 1]}, {t.period_week}-апта</span><span className="text-muted">·</span>
        <span>{TASK_KIND[t.kind].label}</span><span className="text-muted">·</span>
        <span>{shortDate(t.start_date).slice(0, 5)} → <b className={overdue ? 'text-bad' : ''}>{shortDate(t.due_date).slice(0, 5)}</b></span>
      </p>
      <dl className="hidden grid-cols-4 gap-x-3 gap-y-2 rounded-2xl bg-mist px-3.5 py-3 text-xs sm:grid">
        <div className="min-w-0"><dt className="text-[10px] font-semibold tracking-wide text-muted uppercase">Кезеңі</dt>
          <dd className="truncate font-semibold text-ink">{MONTHS[t.period_month - 1]}, {t.period_week}-апта</dd></div>
        <div className="min-w-0"><dt className="text-[10px] font-semibold tracking-wide text-muted uppercase">Түрі</dt>
          <dd className="truncate font-semibold text-ink">{TASK_KIND[t.kind].label}</dd></div>
        <div className="min-w-0"><dt className="text-[10px] font-semibold tracking-wide text-muted uppercase">Берілді</dt>
          <dd className="font-semibold text-ink">{shortDate(t.start_date)}</dd></div>
        <div className="min-w-0"><dt className="text-[10px] font-semibold tracking-wide text-muted uppercase">Мерзімі</dt>
          <dd className={clsx('font-semibold', overdue ? 'text-bad' : 'text-ink')}>{shortDate(t.due_date)}</dd></div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <AttachmentCount n={nFiles} />
          <ScoreBadge a={attemptOf(s)} />
          {s.curator_comment && <Badge tone="brand"><MessageSquare className="size-3" /> Куратор пікірі</Badge>}
        </div>
        <Button size="sm" variant={OPEN.includes(s.status) && mode === 'student' ? 'primary' : 'secondary'} onClick={(e) => { e.stopPropagation(); onOpen(); }} className="ml-auto" data-testid="open-task">
          {mode === 'curator' ? (s.status === 'pending_review' ? 'Тексеру' : 'Ашу') : 'Тапсырманы ашу'} <ChevronRight className="size-4" />
        </Button>
      </div>
    </article>
  );
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : null;
}

type Answer = { text: string; answers: string[]; cells: string[][]; done: boolean };

function SubmissionModal({
  sub, mode, studentName, onClose, onDone, onChanged,
}: { sub: Row; mode: 'student' | 'curator'; studentName?: string; onClose: () => void; onDone: () => void; onChanged: () => void }) {
  const toast = useToast();
  const me = useAccount();
  const t = sub.tasks!;
  const isTest = t.kind === 'test';
  const editable = mode === 'student' && ['new', 'in_progress', 'needs_revision'].includes(sub.status);
  const [comment, setComment] = useState(mode === 'student' ? sub.student_comment ?? '' : sub.curator_comment ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [runner, setRunner] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cols = t.config?.columns ?? [];
  const rows = t.config?.rows ?? 0;
  const [ans, setAns] = useState<Answer>(() => ({
    text: sub.answer_text ?? '',
    answers: (t.config?.questions ?? []).map((_, i) => sub.answer_data?.answers?.[i] ?? ''),
    cells: Array.from({ length: rows }, (_, r) => cols.map((_, c) => sub.answer_data?.cells?.[r]?.[c] ?? '')),
    done: !!sub.answer_data?.done,
  }));

  const extra = useLoad(async () => {
    const sb = supabaseBrowser();
    const [att, files, result, hist] = await Promise.all([
      sb.from('task_attachments').select('*').eq('task_id', t.id).order('created_at'),
      sb.from('submission_files').select('*').eq('submission_id', sub.id).order('created_at'),
      isTest ? sb.rpc('test_result', { p_submission: sub.id }) : Promise.resolve({ data: null, error: null }),
      isTest ? sb.from('test_attempt_history').select('id, attempt_no, test_version, score, max_score, finished_at, reason, result')
        .eq('submission_id', sub.id).order('archived_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    return {
      attachments: must(att) as FileMeta[],
      files: must(files) as FileMeta[],
      result: must(result as { data: unknown; error: unknown }) as TestResult | null,
      history: must(hist as { data: unknown; error: unknown }) as HistoryRow[],
    };
  }, [sub.id, sub.status]);

  const payload = () => {
    const data: Submission['answer_data'] = {};
    if (t.kind === 'questions') data.answers = ans.answers;
    if (t.kind === 'table') data.cells = ans.cells;
    if (t.kind === 'video' || t.kind === 'reading') data.done = ans.done;
    return { answer_text: ans.text.trim() || null, answer_data: Object.keys(data).length ? data : null, student_comment: comment.trim() || null };
  };

  const update = async (patch: Partial<Submission>, msg: string, key: string, close = true) => {
    setBusy(key);
    const { error } = await supabaseBrowser().from('task_submissions').update(patch).eq('id', sub.id);
    setBusy(null);
    if (error) return toast.error(humanError(error));
    toast.success(msg);
    if (close) onDone(); else onChanged();
  };

  const submitWork = () => {
    const files = extra.data?.files ?? [];
    if (t.kind === 'file_upload' && files.length === 0) return toast.error('Кемінде бір файл тіркеңіз.');
    if (t.kind === 'essay' && !ans.text.trim()) return toast.error('Эссе мәтінін жазыңыз.');
    if (t.kind === 'written' && !ans.text.trim() && files.length === 0) return toast.error('Жауабыңызды жазыңыз немесе файл тіркеңіз.');
    if (t.kind === 'questions' && ans.answers.some((a) => !a.trim())) return toast.error('Барлық сұраққа жауап беріңіз.');
    if ((t.kind === 'video' || t.kind === 'reading') && !ans.done) return toast.error(t.kind === 'video' ? 'Видеоны көргеніңізді белгілеңіз.' : 'Материалды оқығаныңызды белгілеңіз.');
    if (uploading) return toast.error('Файлдар жүктеліп жатыр.');
    update({ ...payload(), status: 'pending_review' }, 'Тапсырма куратордың тексеруіне жіберілді', 'submit');
  };

  const removeFile = async (f: FileMeta) => {
    const { error } = await supabaseBrowser().from('submission_files').delete().eq('id', f.id!);
    if (error) return toast.error(humanError(error));
    await removeTaskFiles([f.storage_path]);
    extra.reload(true);
  };

  const words = ans.text.trim() ? ans.text.trim().split(/\s+/).length : 0;
  const attempt = extra.data?.result;
  const testFinished = !!attempt?.finished_at;
  const yt = t.external_url && t.kind === 'video' ? youtubeId(t.external_url) : null;

  const footer = mode === 'student' ? (
    sub.status === 'accepted' ? <Button variant="secondary" onClick={onClose}>Жабу</Button>
      : isTest ? (
        sub.status === 'pending_review' ? <Button variant="secondary" onClick={onClose}>Жабу</Button> : (
          <Button onClick={() => setRunner(true)} data-testid="start-test">
            <Play className="size-4" /> {sub.status === 'needs_revision' ? 'Тестті қайта тапсыру' : attempt && !testFinished ? 'Тестті жалғастыру' : 'Тестті бастау'}
          </Button>
        )
      ) : sub.status === 'pending_review' ? (
        <Button variant="secondary" loading={busy === 'undo'} onClick={() => update({ status: 'in_progress' }, 'Тапсыру кері қайтарылды', 'undo', false)}>
          <Undo2 className="size-4" /> Тапсыруды кері қайтару
        </Button>
      ) : (
        <>
          <Button variant="secondary" loading={busy === 'save'} onClick={() => update({ ...payload(), ...(sub.status === 'new' ? { status: 'in_progress' as const } : {}) }, 'Жауап сақталды', 'save', false)} data-testid="save-draft">
            <Save className="size-4" /> Сақтау
          </Button>
          <Button loading={busy === 'submit'} onClick={submitWork} data-testid="submit-work"><CheckCircle2 className="size-4" /> Орындалды</Button>
        </>
      )
  ) : (
    <>
      <Button variant="danger" loading={busy === 'rev'} onClick={() => {
        if (!comment.trim()) return toast.error('Қайта орындауға жіберу үшін пікір жазыңыз.');
        update({ status: 'needs_revision', curator_comment: comment.trim() }, 'Қайта орындауға жіберілді', 'rev');
      }}>
        <RotateCcw className="size-4" /> Қайта орындауға
      </Button>
      <Button loading={busy === 'acc'} disabled={sub.status === 'accepted'} onClick={() => update({ status: 'accepted', curator_comment: comment.trim() || null }, 'Тапсырма қабылданды', 'acc')} data-testid="accept-task">
        <CheckCircle2 className="size-4" /> Қабылдау
      </Button>
    </>
  );

  const ro = !editable; // тек оқу режимі

  return (
    <>
      <Modal open onClose={onClose} size="lg" title={t.title}
        subtitle={mode === 'curator' && studentName ? studentName : `Берілген күні: ${shortDate(t.start_date)}`} footer={footer}>
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5">
            <StatusPill status={sub.status} overdue={isOverdue(sub)} />
            <KindBadge kind={t.kind} />
            <Badge><CalendarRange className="size-3" /> {MONTHS[t.period_month - 1]}, {t.period_week}-апта</Badge>
            <Badge><CalendarClock className="size-3" /> {shortDate(t.start_date)} – {shortDate(t.due_date)}</Badge>
            <Badge tone={PRIORITY[t.priority].tone}>Маңыздылығы: {PRIORITY[t.priority].label}</Badge>
            {isTest && t.time_limit_minutes && <Badge tone="info">{t.time_limit_minutes} минут</Badge>}
          </div>
          {t.description && (
            <section>
              <h4 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Сипаттамасы</h4>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{t.description}</p>
            </section>
          )}
          {t.instructions && (
            <section className="rounded-2xl bg-brand-50 p-4">
              <h4 className="mb-1 text-xs font-bold tracking-wide text-brand-700 uppercase">Орындау нұсқаулығы</h4>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{t.instructions}</p>
            </section>
          )}

          {extra.loading ? <LoadingBlock rows={2} /> : extra.error ? <ErrorState text={extra.error} onRetry={extra.reload} /> : (
            <>
              {!!extra.data!.attachments.length && (
                <section>
                  <h4 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Материалдар</h4>
                  <FileList files={extra.data!.attachments} />
                </section>
              )}

              {t.kind === 'video' && t.external_url && (
                <section className="space-y-2">
                  {yt ? (
                    <div className="aspect-video overflow-hidden rounded-2xl bg-brand-950">
                      <iframe src={`https://www.youtube-nocookie.com/embed/${yt}`} title={t.title} className="size-full" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
                    </div>
                  ) : null}
                  <a href={t.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
                    <ExternalLink className="size-4" /> {yt ? 'YouTube-та ашу' : 'Видеоны ашу'}
                  </a>
                </section>
              )}
              {t.kind === 'external_link' && t.external_url && (
                <a href={t.external_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl bg-brand-900 p-4 text-white transition hover:bg-brand-800">
                  <ExternalLink className="size-5 shrink-0 text-white/75" />
                  <span className="min-w-0"><span className="block text-sm font-bold">Тапсырманы сайтта орындау</span><span className="block truncate text-xs text-white/70">{t.external_url}</span></span>
                </a>
              )}

              {isTest && extra.data!.history.length > 0 && <AttemptHistory rows={extra.data!.history} />}
              {isTest ? (
                attempt ? <TestResultView result={attempt} /> : (
                  <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-line">
                    <p className="flex items-center gap-2 font-bold text-ink"><ListChecks className="size-4" /> Тест әлі тапсырылмаған</p>
                    {mode === 'student' && <p className="mt-1 text-muted">«Тестті бастау» батырмасын басқанда уақыт есептеле бастайды. Нәтиже бірден шығады.</p>}
                  </div>
                )
              ) : (
                <ResponseBlock t={t} ans={ans} setAns={setAns} ro={ro} words={words} mode={mode} />
              )}

              {!isTest && (editable || extra.data!.files.length > 0) && (
                <section className="space-y-2">
                  <h4 className="text-xs font-bold tracking-wide text-muted uppercase">
                    {mode === 'student' ? (t.kind === 'file_upload' ? 'Менің файлдарым *' : 'Файл тіркеу (міндетті емес)') : 'Оқушы жіберген файлдар'}
                  </h4>
                  {editable && (
                    <FileUploader uid={me.id} folder={sub.id} onBusyChange={setUploading} label="Файл жіберу"
                      onUploaded={async (m) => {
                        const r = await supabaseBrowser().from('submission_files').insert({ ...m, submission_id: sub.id, student_id: sub.student_id });
                        if (r.error) { await removeTaskFiles([m.storage_path]); throw r.error; }
                        extra.reload(true);
                      }} />
                  )}
                  <FileList files={extra.data!.files} onRemove={editable ? removeFile : undefined} />
                </section>
              )}
            </>
          )}

          {(sub.submitted_at || sub.reviewed_at) && (
            <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
              {sub.submitted_at && <p>Тапсырылды: <b className="text-ink">{dateTime(sub.submitted_at)}</b></p>}
              {sub.reviewed_at && <p>Тексерілді: <b className="text-ink">{dateTime(sub.reviewed_at)}</b></p>}
            </div>
          )}
          {mode === 'curator' && sub.student_comment && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
              <h4 className="mb-1 text-xs font-bold text-muted">Оқушының пікірі</h4>
              <p className="text-sm whitespace-pre-wrap">{sub.student_comment}</p>
            </section>
          )}
          {mode === 'student' && sub.curator_comment && (
            <section className={clsx('rounded-2xl p-4', sub.status === 'needs_revision' ? 'bg-bad-soft' : 'bg-ok-soft')}>
              <h4 className="mb-1 text-xs font-bold text-muted">Куратордың пікірі</h4>
              <p className="text-sm whitespace-pre-wrap">{sub.curator_comment}</p>
            </section>
          )}
          {(mode === 'curator' || (editable && !isTest)) && (
            <Field label={mode === 'student' ? 'Куратор үшін түсініктеме (міндетті емес)' : 'Оқушыға пікір'}>
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000}
                placeholder={mode === 'student' ? 'Мысалы: 7-есепте сұрағым бар' : 'Мысалы: жарайсың! немесе 3-есепті қайта қара'} />
            </Field>
          )}
        </div>
      </Modal>
      {runner && (
        <TestRunner submissionId={sub.id} title={t.title}
          onClose={() => { setRunner(false); extra.reload(true); onChanged(); }}
          onFinished={() => { extra.reload(true); onChanged(); }} />
      )}
    </>
  );
}

type HistoryRow = { id: string; attempt_no: number; test_version: number; score: number | null; max_score: number | null; finished_at: string | null; reason: 'retake' | 'new_version'; result: TestResult | null };

/** Бұрынғы әрекеттер (қайта тапсыру немесе тесттің жаңа нұсқасы кезінде сақталған нәтижелер) */
function AttemptHistory({ rows }: { rows: HistoryRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const cur = rows.find((r) => r.id === open);
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-line" data-testid="attempt-history">
      <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-muted"><History className="size-4" /> Бұрынғы нәтижелер</h4>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)}
              className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-mist px-3 py-2 text-left text-xs hover:bg-mist-dark">
              <b className="text-ink">{r.attempt_no}-әрекет</b>
              {r.test_version > 1 && <span className="text-muted">· {r.test_version}-нұсқа</span>}
              <span className="text-muted">· {r.finished_at ? dateTime(r.finished_at) : '—'}</span>
              <span className="text-muted">· {r.reason === 'retake' ? 'қайта тапсыру' : 'тест жаңартылды'}</span>
              <span className="ml-auto font-bold text-ink">{Number(r.score)}/{Number(r.max_score)}</span>
            </button>
          </li>
        ))}
      </ul>
      {cur?.result && <div className="mt-3"><TestResultView result={cur.result} /></div>}
    </section>
  );
}

function ResponseBlock({
  t, ans, setAns, ro, words, mode,
}: { t: Task; ans: Answer; setAns: React.Dispatch<React.SetStateAction<Answer>>; ro: boolean; words: number; mode: 'student' | 'curator' }) {
  const label = mode === 'curator' ? 'Оқушының жауабы' : 'Менің жауабым';
  const empty = <p className="text-sm text-muted italic">Жауап әлі жоқ</p>;

  if (t.kind === 'questions') {
    return (
      <section className="space-y-3">
        <h4 className="text-xs font-bold tracking-wide text-muted uppercase">{label}</h4>
        {(t.config.questions ?? []).map((q, i) => (
          <div key={i} className="rounded-2xl bg-white p-3 ring-1 ring-line">
            <p className="mb-2 text-sm font-bold text-ink">{i + 1}. {q}</p>
            {ro ? <p className="text-sm whitespace-pre-wrap">{ans.answers[i] || <i className="text-muted">—</i>}</p> : (
              <Textarea rows={2} value={ans.answers[i]} aria-label={`${i + 1}-сұраққа жауап`} maxLength={5000}
                onChange={(e) => setAns((s) => ({ ...s, answers: s.answers.map((x, j) => (j === i ? e.target.value : x)) }))} />
            )}
          </div>
        ))}
      </section>
    );
  }
  if (t.kind === 'table') {
    const cols = t.config.columns ?? [];
    return (
      <section className="space-y-2">
        <h4 className="text-xs font-bold tracking-wide text-muted uppercase">{label}</h4>
        <div className="overflow-x-auto rounded-2xl ring-1 ring-line">
          <table className="w-full min-w-[480px] border-collapse bg-white text-sm">
            <thead><tr className="bg-brand-900 text-left text-white">
              <th className="w-10 px-2 py-2 text-center text-xs">№</th>
              {cols.map((c, i) => <th key={i} className="px-3 py-2 text-xs font-bold">{c}</th>)}
            </tr></thead>
            <tbody>
              {ans.cells.map((row, r) => (
                <tr key={r} className="border-t border-line">
                  <td className="px-2 text-center text-xs text-muted">{r + 1}</td>
                  {row.map((cell, c) => (
                    <td key={c} className="border-l border-line p-0">
                      {ro ? <span className="block px-3 py-2">{cell}</span> : (
                        <input value={cell} maxLength={500} aria-label={`${r + 1}-жол, ${cols[c]}`}
                          onChange={(e) => setAns((s) => ({ ...s, cells: s.cells.map((rr, i) => (i === r ? rr.map((x, j) => (j === c ? e.target.value : x)) : rr)) }))}
                          className="w-full bg-transparent px-3 py-2 outline-none focus:bg-brand-50" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }
  if (t.kind === 'video' || t.kind === 'reading') {
    const doneLabel = t.kind === 'video' ? 'Видеоны толық көрдім' : 'Материалды толық оқып шықтым';
    return (
      <section className="space-y-3">
        {ro ? (
          <Badge tone={ans.done ? 'ok' : 'neutral'}>{ans.done ? `✓ ${doneLabel}` : 'Әлі белгіленбеген'}</Badge>
        ) : (
          <div className="rounded-2xl bg-white ring-1 ring-line"><Checkbox checked={ans.done} onChange={(v) => setAns((s) => ({ ...s, done: v }))} label={doneLabel} /></div>
        )}
        <h4 className="text-xs font-bold tracking-wide text-muted uppercase">{t.kind === 'video' ? 'Қысқаша қорытынды' : 'Конспект / негізгі ойлар'} {mode === 'student' && '(міндетті емес)'}</h4>
        {ro ? (ans.text ? <p className="text-sm whitespace-pre-wrap">{ans.text}</p> : empty) : (
          <Textarea rows={3} value={ans.text} onChange={(e) => setAns((s) => ({ ...s, text: e.target.value }))} maxLength={50000} />
        )}
      </section>
    );
  }
  if (t.kind === 'file_upload') {
    return ans.text || !ro ? (
      <section className="space-y-2">
        <h4 className="text-xs font-bold tracking-wide text-muted uppercase">Түсініктеме</h4>
        {ro ? <p className="text-sm whitespace-pre-wrap">{ans.text}</p> : <Textarea rows={2} value={ans.text} onChange={(e) => setAns((s) => ({ ...s, text: e.target.value }))} maxLength={50000} />}
      </section>
    ) : null;
  }
  // written, essay, external_link
  const essay = t.kind === 'essay';
  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <h4 className="text-xs font-bold tracking-wide text-muted uppercase">{t.kind === 'external_link' ? 'Нәтиже / жауап' : essay ? 'Эссе мәтіні' : label}</h4>
        {essay && <span className="text-xs font-semibold text-brand-700" data-testid="word-count">{words} сөз</span>}
      </div>
      {ro ? (ans.text ? <p className="rounded-2xl bg-white p-4 text-sm leading-relaxed whitespace-pre-wrap ring-1 ring-line">{ans.text}</p> : empty) : (
        <Textarea rows={essay ? 12 : 5} value={ans.text} onChange={(e) => setAns((s) => ({ ...s, text: e.target.value }))} maxLength={50000}
          placeholder={essay ? 'Эссеңізді осында жазыңыз' : 'Жауабыңызды жазыңыз'} aria-label={label} />
      )}
    </section>
  );
}

/** Ескі атаумен үйлесімділік: жаңа редакторды ашады */
export function CreateTaskModal({
  students, preselected = [], onClose, onCreated,
}: { students: { id: string; full_name: string }[]; preselected?: string[]; onClose: () => void; onCreated: () => void }) {
  return <TaskEditorModal students={students} preselected={preselected} onClose={onClose} onSaved={onCreated} />;
}

type CatalogTask = Task & {
  task_submissions: { id: string; student_id: string; status: SubmissionStatus }[];
  task_attachments: { id: string; storage_path: string }[];
  test_attempts: { student_id: string; score: number | null; max_score: number | null; finished_at: string | null }[];
};

/** Куратордың өзі құрған тапсырмалары және әр оқушының статусы */
export function CuratorTaskCatalog({ curatorId, names }: { curatorId: string; names: Map<string, string> }) {
  const [del, setDel] = useState<CatalogTask | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const students = useMemo(() => [...names.entries()].map(([id, full_name]) => ({ id, full_name })), [names]);
  const { data, error, loading, reload } = useLoad(async () => {
    const res = await supabaseBrowser().from('tasks')
      .select('*, task_submissions(id, student_id, status), task_attachments(id, storage_path), test_attempts(student_id, score, max_score, finished_at)')
      .eq('curator_id', curatorId).order('created_at', { ascending: false });
    return must(res) as CatalogTask[];
  }, [curatorId]);
  useRealtime(['tasks', 'task_submissions', 'test_attempts'], () => reload(true));

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data?.length) return <EmptyState icon={ClipboardList} title="Әлі тапсырма құрылмаған" />;
  return (
    <div className="space-y-3">
      {data.map((t) => {
        const subs = t.task_submissions;
        const acc = subs.filter((s) => s.status === 'accepted').length;
        const done = t.test_attempts.filter((a) => a.finished_at);
        const avg = done.length ? Math.round(done.reduce((a, x) => a + (Number(x.score) * 100) / Math.max(1, Number(x.max_score)), 0) / done.length) : null;
        return (
          <Card key={t.id} className="p-4 sm:p-5" data-testid="catalog-task">
            <div className="flex items-start justify-between gap-3">
              <button type="button" className="min-w-0 text-left" onClick={() => setViewId(t.id)}>
                <p className="font-bold text-ink hover:underline">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted">{periodShort(t)} · {shortDate(t.start_date)} – {shortDate(t.due_date)} · {subs.length} оқушы · {acc} қабылданды
                  {t.kind === 'test' && ` · ${done.length} тапсырды${avg != null ? ` · орташа ${avg}%` : ''}`}</p>
              </button>
              <ActionMenu label={`«${t.title}» әрекеттері`} items={[
                { label: 'Тапсырманы ашу', icon: Eye, onSelect: () => setViewId(t.id), testId: 'task-open' },
                { label: 'Тапсырманы өзгерту', icon: Pencil, onSelect: () => setEditId(t.id), testId: 'task-edit' },
                { label: 'Тапсырманы көшіру', icon: Copy, onSelect: () => setCopyId(t.id), testId: 'task-copy' },
                { label: 'Тапсырманы өшіру', icon: Trash2, onSelect: () => setDel(t), danger: true, testId: 'task-delete' },
              ]} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <KindBadge kind={t.kind} />
              <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
              <AttachmentCount n={t.task_attachments.length} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {subs.map((s) => {
                const a = t.test_attempts.find((x) => x.student_id === s.student_id && x.finished_at);
                return (
                  <Badge key={s.id} tone={SUBMISSION_STATUS[s.status].tone}>
                    {names.get(s.student_id) ?? 'Оқушы'} · {SUBMISSION_STATUS[s.status].label}{a ? ` · ${Number(a.score)}/${Number(a.max_score)}` : ''}
                  </Badge>
                );
              })}
            </div>
          </Card>
        );
      })}
      {del && <DeleteTaskModal task={del} names={names} onClose={() => setDel(null)} onDone={() => { setDel(null); reload(true); }} />}
      {editId && <TaskEditorModal students={students} editId={editId} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); reload(true); }} />}
      {copyId && <TaskEditorModal students={students} copyId={copyId} onClose={() => setCopyId(null)} onSaved={() => { setCopyId(null); reload(true); }} />}
      {viewId && (
        <TaskDetailModal taskId={viewId} names={names} onClose={() => setViewId(null)}
          onEdit={() => { setEditId(viewId); setViewId(null); }} onCopy={() => { setCopyId(viewId); setViewId(null); }} />
      )}
    </div>
  );
}

/** Тапсырманы өшіру: барлық оқушыдан немесе тек бір оқушыдан (растаумен, soft delete) */
function DeleteTaskModal({ task, names, onClose, onDone }: {
  task: CatalogTask; names: Map<string, string>; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const subs = task.task_submissions;
  const [target, setTarget] = useState<{ kind: 'all' } | { kind: 'one'; id: string; name: string } | null>(subs.length <= 1 ? { kind: 'all' } : null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!target) return;
    setBusy(true);
    const sb = supabaseBrowser();
    const { error } = target.kind === 'all'
      ? await sb.rpc('delete_task', { p_task: task.id })
      : await sb.rpc('delete_task_assignment', { p_submission: target.id });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success(target.kind === 'all' ? 'Тапсырма барлық оқушыдан өшірілді' : `Тапсырма ${target.name} оқушысынан өшірілді`);
    onDone();
  };

  return (
    <Modal open onClose={onClose} size="sm" title="Тапсырманы өшіру" subtitle={task.title}
      footer={target ? (
        <>
          <Button variant="secondary" onClick={() => (subs.length > 1 ? setTarget(null) : onClose())}>{subs.length > 1 ? 'Артқа' : 'Бас тарту'}</Button>
          <Button onClick={run} loading={busy} data-testid="confirm-delete" data-autofocus>Иә, өшіру</Button>
        </>
      ) : <Button variant="secondary" onClick={onClose}>Бас тарту</Button>}>
      {target ? (
        <div className="space-y-3 text-sm leading-relaxed text-ink" role="alert">
          <p>
            {target.kind === 'all'
              ? <>«<b>{task.title}</b>» тапсырмасы <b>барлық оқушыдан</b> ({subs.length}) өшіріледі.</>
              : <>«<b>{task.title}</b>» тапсырмасы тек <b>{target.name}</b> оқушысынан өшіріледі. Басқа оқушыларда қала береді.</>}
          </p>
          <p className="rounded-2xl bg-mist px-4 py-3 text-xs text-muted">
            Тапсырма оқушы кабинетінен бірден жоғалады. Орындалу тарихы мен нәтижелері жойылмайды — ұйымдастырушы архивтен қарай алады.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <button type="button" onClick={() => setTarget({ kind: 'all' })} data-testid="delete-all"
            className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-line transition hover:ring-bad/40">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bad-soft text-bad"><Trash2 className="size-5" /></span>
            <span><span className="block text-sm font-bold text-ink">Барлық оқушыдан өшіру</span>
              <span className="block text-xs text-muted">{subs.length} оқушының бәрінен алынады</span></span>
          </button>
          <div>
            <p className="mb-2 text-xs font-bold text-ink">Тек бір оқушыдан өшіру</p>
            <ul className="space-y-1.5">
              {subs.map((s) => {
                const name = names.get(s.student_id) ?? 'Оқушы';
                return (
                  <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 ring-1 ring-line">
                    <Avatar name={name} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{name}</span>
                      <span className="block text-[11px] text-muted">{SUBMISSION_STATUS[s.status].label}</span>
                    </span>
                    <Button size="sm" variant="danger" onClick={() => setTarget({ kind: 'one', id: s.id, name })} aria-label={`${name} оқушысынан өшіру`}>Өшіру</Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}


/** Куратор: тапсырманы ашу — толық мазмұны және әр оқушының нәтижесі */
function TaskDetailModal({ taskId, names, onClose, onEdit, onCopy }: {
  taskId: string; names: Map<string, string>; onClose: () => void; onEdit: () => void; onCopy: () => void;
}) {
  const [openSub, setOpenSub] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    const sb = supabaseBrowser();
    const [task, subs] = await Promise.all([
      sb.from('tasks').select('*, task_attachments(*), test_questions(id, version, points)').eq('id', taskId).single(),
      sb.from('task_submissions').select('*, tasks(*, task_attachments(id)), test_attempts(score, max_score, finished_at)').eq('task_id', taskId),
    ]);
    const t = must(task) as Task & { task_attachments: FileMeta[]; test_questions: { id: string; version: number; points: number }[] };
    return { t, subs: (must(subs) as Row[]).sort((a, b) => (names.get(a.student_id) ?? '').localeCompare(names.get(b.student_id) ?? '')) };
  }, [taskId]);
  useRealtime(['task_submissions', 'test_attempts'], () => reload(true), `task_id=eq.${taskId}`);
  const sub = data?.subs.find((x) => x.id === openSub) ?? null;
  const qs = data ? data.t.test_questions.filter((q) => q.version === data.t.test_version) : [];

  return (
    <>
      <Modal open onClose={onClose} size="lg" title={data?.t.title ?? 'Тапсырма'}
        subtitle={data ? `${TASK_KIND[data.t.kind].label} · ${periodShort(data.t)}` : undefined}
        footer={<>
          <Button variant="secondary" onClick={onCopy}><Copy className="size-4" /> Көшіру</Button>
          <Button onClick={onEdit} data-testid="detail-edit"><Pencil className="size-4" /> Өзгерту</Button>
        </>}>
        {loading ? <LoadingBlock rows={3} /> : error ? <ErrorState text={error} onRetry={reload} /> : data && (
          <div className="space-y-5" data-testid="task-detail">
            <div className="flex flex-wrap gap-1.5">
              <KindBadge kind={data.t.kind} />
              <Badge><CalendarRange className="size-3" /> {MONTHS[data.t.period_month - 1]}, {data.t.period_week}-апта</Badge>
              <Badge><CalendarClock className="size-3" /> {shortDate(data.t.start_date)} – {shortDate(data.t.due_date)}</Badge>
              {data.t.kind === 'test' && <Badge tone="info">{qs.length} сұрақ · {qs.reduce((a, q) => a + Number(q.points), 0)} ұпай{data.t.test_version > 1 ? ` · ${data.t.test_version}-нұсқа` : ''}</Badge>}
            </div>
            {data.t.description && <p className="text-sm leading-relaxed whitespace-pre-wrap">{data.t.description}</p>}
            {data.t.instructions && (
              <section className="rounded-2xl bg-mist p-4">
                <h4 className="mb-1 text-xs font-bold text-muted">Орындау нұсқаулығы</h4>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{data.t.instructions}</p>
              </section>
            )}
            {data.t.task_attachments.length > 0 && (
              <section>
                <h4 className="mb-2 text-xs font-bold text-muted">Материалдар</h4>
                <FileList files={data.t.task_attachments} />
              </section>
            )}
            <section>
              <h4 className="mb-2 text-xs font-bold text-muted">Оқушылар ({data.subs.length})</h4>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl ring-1 ring-line">
                {data.subs.map((x) => {
                  const a = attemptOf(x);
                  const name = names.get(x.student_id) ?? 'Оқушы';
                  return (
                    <li key={x.id}>
                      <button type="button" onClick={() => setOpenSub(x.id)} className="flex w-full items-center gap-3 bg-white px-3 py-2.5 text-left hover:bg-mist">
                        <Avatar name={name} size={30} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{name}</span>
                        <ScoreBadge a={a} />
                        <StatusPill status={x.status} overdue={isOverdue(x)} />
                        <ChevronRight className="size-4 shrink-0 text-muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </Modal>
      {sub && (
        <SubmissionModal sub={sub} mode="curator" studentName={names.get(sub.student_id)}
          onClose={() => setOpenSub(null)} onChanged={() => reload(true)} onDone={() => { setOpenSub(null); reload(true); }} />
      )}
    </>
  );
}
