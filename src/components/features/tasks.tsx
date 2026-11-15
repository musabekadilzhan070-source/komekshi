'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  CalendarClock, CheckCircle2, ClipboardList, ExternalLink, ListChecks, MessageSquare, Pencil, Play, RotateCcw, Save, Trash2, Undo2,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { dateTime, shortDate, todayISO } from '@/lib/date';
import { PRIORITY, SUBMISSION_STATUS, TASK_KIND } from '@/lib/labels';
import { removeTaskFiles } from '@/lib/files';
import type { Submission, SubmissionStatus, Task, TestAttempt, TestResult } from '@/lib/types';
import { useAccount } from '@/components/shell/account-context';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingBlock, Tabs } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ConfirmModal, Modal } from '@/components/ui/modal';
import { Checkbox, Field, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { KIND_ICON, TaskEditorModal } from './task-editor';
import { AttachmentCount, FileList, FileUploader, type FileMeta } from './task-files';
import { TestResultView, TestRunner } from './test-runner';

type Filter = 'active' | 'review' | 'done' | 'all';
const FILTERS: Record<Filter, SubmissionStatus[] | null> = {
  active: ['new', 'in_progress', 'needs_revision'],
  review: ['pending_review'],
  done: ['accepted'],
  all: null,
};

type Attempt = Pick<TestAttempt, 'score' | 'max_score' | 'finished_at'>;
type Row = Submission & { test_attempts: Attempt | Attempt[] | null; task_attachments?: { id: string }[] };
const attemptOf = (s: Row): Attempt | null => (Array.isArray(s.test_attempts) ? s.test_attempts[0] ?? null : s.test_attempts);

export function KindBadge({ kind }: { kind: Task['kind'] }) {
  const Icon = KIND_ICON[kind];
  return <Badge tone="navy"><Icon className="size-3" /> {TASK_KIND[kind].label}</Badge>;
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
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, error, loading, reload } = useLoad(async () => {
    let q = supabaseBrowser().from('task_submissions')
      .select('*, tasks(*, task_attachments(id)), test_attempts(score, max_score, finished_at)')
      .order('assigned_at', { ascending: false });
    if (studentId) q = q.eq('student_id', studentId);
    return must(await q) as Row[];
  }, [studentId]);
  useRealtime(['task_submissions', 'test_attempts'], () => reload(true), studentId ? `student_id=eq.${studentId}` : undefined);

  useEffect(() => {
    if (focusId && data?.some((x) => x.id === focusId)) setOpenId(focusId);
  }, [focusId, data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { active: 0, review: 0, done: 0, all: data?.length ?? 0 };
    (data ?? []).forEach((s) => (Object.keys(FILTERS) as Filter[]).forEach((f) => { if (FILTERS[f]?.includes(s.status)) c[f]++; }));
    return c;
  }, [data]);

  const list = (data ?? []).filter((s) => !FILTERS[filter] || FILTERS[filter]!.includes(s.status))
    .sort((a, b) => (a.tasks?.due_date ?? '').localeCompare(b.tasks?.due_date ?? ''));
  const today = todayISO();
  const open = data?.find((s) => s.id === openId) ?? null;

  return (
    <div>
      <Tabs
        className="mb-4"
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'active', label: mode === 'student' ? 'Орындалатын' : 'Орындалуда', count: counts.active },
          { value: 'review', label: 'Тексеруді күтуде', count: counts.review },
          { value: 'done', label: 'Қабылданған', count: counts.done },
          { value: 'all', label: 'Барлығы', count: counts.all },
        ]}
      />
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
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((s) => {
            const t = s.tasks!;
            const overdue = ['new', 'in_progress', 'needs_revision'].includes(s.status) && t.due_date < today;
            const nFiles = (t as Task & { task_attachments?: { id: string }[] }).task_attachments?.length ?? 0;
            return (
              <button
                key={s.id}
                onClick={() => setOpenId(s.id)}
                data-testid="submission-card"
                className="card group flex flex-col p-4 text-left transition-shadow hover:shadow-lift sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-bold text-navy-900">{t.title}</p>
                  <Badge tone={SUBMISSION_STATUS[s.status].tone}>{SUBMISSION_STATUS[s.status].label}</Badge>
                </div>
                {mode === 'curator' && names && (
                  <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-navy-700">
                    <Avatar name={names.get(s.student_id) ?? '?'} size={20} /> {names.get(s.student_id) ?? 'Оқушы'}
                  </p>
                )}
                {t.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{t.description}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                  <KindBadge kind={t.kind} />
                  <Badge tone={overdue ? 'bad' : 'neutral'}><CalendarClock className="size-3" /> {overdue ? 'Мерзімі өтті: ' : 'Мерзімі: '}{shortDate(t.due_date)}</Badge>
                  <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
                  <AttachmentCount n={nFiles} />
                  <ScoreBadge a={attemptOf(s)} />
                  {s.curator_comment && <Badge tone="navy"><MessageSquare className="size-3" /> Пікір</Badge>}
                </div>
              </button>
            );
          })}
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
    const [att, files, result] = await Promise.all([
      sb.from('task_attachments').select('*').eq('task_id', t.id).order('created_at'),
      sb.from('submission_files').select('*').eq('submission_id', sub.id).order('created_at'),
      isTest ? sb.rpc('test_result', { p_submission: sub.id }) : Promise.resolve({ data: null, error: null }),
    ]);
    return {
      attachments: must(att) as FileMeta[],
      files: must(files) as FileMeta[],
      result: must(result as { data: unknown; error: unknown }) as TestResult | null,
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
            <KindBadge kind={t.kind} />
            <Badge tone={SUBMISSION_STATUS[sub.status].tone}>{SUBMISSION_STATUS[sub.status].label}</Badge>
            <Badge tone={PRIORITY[t.priority].tone}>Маңыздылығы: {PRIORITY[t.priority].label}</Badge>
            <Badge><CalendarClock className="size-3" /> {shortDate(t.start_date)} – {shortDate(t.due_date)}</Badge>
            {isTest && t.time_limit_minutes && <Badge tone="info">{t.time_limit_minutes} минут</Badge>}
          </div>
          {t.description && (
            <section>
              <h4 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Сипаттамасы</h4>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{t.description}</p>
            </section>
          )}
          {t.instructions && (
            <section className="rounded-2xl bg-navy-50 p-4">
              <h4 className="mb-1 text-xs font-bold tracking-wide text-navy-700 uppercase">Орындау нұсқаулығы</h4>
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
                    <div className="aspect-video overflow-hidden rounded-2xl bg-navy-950">
                      <iframe src={`https://www.youtube-nocookie.com/embed/${yt}`} title={t.title} className="size-full" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
                    </div>
                  ) : null}
                  <a href={t.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:underline">
                    <ExternalLink className="size-4" /> {yt ? 'YouTube-та ашу' : 'Видеоны ашу'}
                  </a>
                </section>
              )}
              {t.kind === 'external_link' && t.external_url && (
                <a href={t.external_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl bg-navy-900 p-4 text-white transition hover:bg-navy-800">
                  <ExternalLink className="size-5 shrink-0 text-sand-300" />
                  <span className="min-w-0"><span className="block text-sm font-bold">Тапсырманы сайтта орындау</span><span className="block truncate text-xs text-white/70">{t.external_url}</span></span>
                </a>
              )}

              {isTest ? (
                attempt ? <TestResultView result={attempt} /> : (
                  <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-line">
                    <p className="flex items-center gap-2 font-bold text-navy-900"><ListChecks className="size-4" /> Тест әлі тапсырылмаған</p>
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
            <p className="mb-2 text-sm font-bold text-navy-900">{i + 1}. {q}</p>
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
            <thead><tr className="bg-navy-900 text-left text-white">
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
                          className="w-full bg-transparent px-3 py-2 outline-none focus:bg-navy-50" />
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
        {essay && <span className="text-xs font-semibold text-navy-700" data-testid="word-count">{words} сөз</span>}
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
  const toast = useToast();
  const [del, setDel] = useState<CatalogTask | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const students = useMemo(() => [...names.entries()].map(([id, full_name]) => ({ id, full_name })), [names]);
  const { data, error, loading, reload } = useLoad(async () => {
    const res = await supabaseBrowser().from('tasks')
      .select('*, task_submissions(id, student_id, status), task_attachments(id, storage_path), test_attempts(student_id, score, max_score, finished_at)')
      .eq('curator_id', curatorId).order('created_at', { ascending: false });
    return must(res) as CatalogTask[];
  }, [curatorId]);
  useRealtime(['task_submissions', 'test_attempts'], () => reload(true));

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from('tasks').delete().eq('id', del.id);
    setBusy(false);
    if (error) return toast.error(humanError(error));
    await removeTaskFiles(del.task_attachments.map((a) => a.storage_path));
    toast.success('Тапсырма өшірілді');
    setDel(null);
    reload(true);
  };

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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-navy-900">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted">{shortDate(t.start_date)} – {shortDate(t.due_date)} · {subs.length} оқушы · {acc} қабылданды
                  {t.kind === 'test' && ` · ${done.length} тапсырды${avg != null ? ` · орташа ${avg}%` : ''}`}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <KindBadge kind={t.kind} />
                <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
                <AttachmentCount n={t.task_attachments.length} />
                <button onClick={() => setEditId(t.id)} aria-label="Өңдеу" title="Өңдеу" className="flex size-8 items-center justify-center rounded-full text-navy-900 hover:bg-navy-50"><Pencil className="size-4" /></button>
                <button onClick={() => setDel(t)} aria-label="Өшіру" title="Өшіру" className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-bad-soft hover:text-bad"><Trash2 className="size-4" /></button>
              </div>
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
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} danger title="Тапсырманы өшіру"
        text={<>«<b>{del?.title}</b>» тапсырмасы барлық оқушылардан өшіріледі.</>} confirmLabel="Өшіру" />
      {editId && <TaskEditorModal students={students} editId={editId} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); reload(true); }} />}
    </div>
  );
}

