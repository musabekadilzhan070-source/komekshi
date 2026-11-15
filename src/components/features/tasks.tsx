'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { CalendarClock, CheckCircle2, ClipboardList, MessageSquare, Play, RotateCcw, Send, Trash2, Undo2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { dateTime, shortDate, todayISO, addDays } from '@/lib/date';
import { PRIORITY, SUBMISSION_STATUS } from '@/lib/labels';
import type { Priority, Submission, SubmissionStatus, Task } from '@/lib/types';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingBlock, Tabs } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ConfirmModal, Modal } from '@/components/ui/modal';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { StudentMultiSelect } from './students';

type Filter = 'active' | 'review' | 'done' | 'all';
const FILTERS: Record<Filter, SubmissionStatus[] | null> = {
  active: ['new', 'in_progress', 'needs_revision'],
  review: ['pending_review'],
  done: ['accepted'],
  all: null,
};

/** Тапсырмалар тізімі. studentId берілмесе — куратордың барлық оқушылары */
export function SubmissionList({
  studentId, mode, names, defaultFilter = 'active',
}: { studentId?: string; mode: 'student' | 'curator'; names?: Map<string, string>; defaultFilter?: Filter }) {
  const params = useSearchParams();
  const focusId = params.get('id') || params.get('review');
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [open, setOpen] = useState<Submission | null>(null);

  const { data, error, loading, reload } = useLoad(async () => {
    let q = supabaseBrowser().from('task_submissions').select('*, tasks(*)').order('assigned_at', { ascending: false });
    if (studentId) q = q.eq('student_id', studentId);
    return must(await q) as Submission[];
  }, [studentId]);
  useRealtime(['task_submissions'], () => reload(true), studentId ? `student_id=eq.${studentId}` : undefined);

  useEffect(() => {
    if (focusId && data) {
      const s = data.find((x) => x.id === focusId);
      if (s) setOpen(s);
    }
  }, [focusId, data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { active: 0, review: 0, done: 0, all: data?.length ?? 0 };
    (data ?? []).forEach((s) => (Object.keys(FILTERS) as Filter[]).forEach((f) => { if (FILTERS[f]?.includes(s.status)) c[f]++; }));
    return c;
  }, [data]);

  const list = (data ?? []).filter((s) => !FILTERS[filter] || FILTERS[filter]!.includes(s.status))
    .sort((a, b) => (a.tasks?.due_date ?? '').localeCompare(b.tasks?.due_date ?? ''));
  const today = todayISO();

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
            return (
              <button
                key={s.id}
                onClick={() => setOpen(s)}
                className="card group flex flex-col p-4 text-left transition-shadow hover:shadow-lift sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-bold text-berry-900">{t.title}</p>
                  <Badge tone={SUBMISSION_STATUS[s.status].tone}>{SUBMISSION_STATUS[s.status].label}</Badge>
                </div>
                {mode === 'curator' && names && (
                  <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-berry-700">
                    <Avatar name={names.get(s.student_id) ?? '?'} size={20} /> {names.get(s.student_id) ?? 'Оқушы'}
                  </p>
                )}
                {t.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{t.description}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                  <Badge tone={overdue ? 'bad' : 'neutral'}><CalendarClock className="size-3" /> {overdue ? 'Мерзімі өтті: ' : 'Мерзімі: '}{shortDate(t.due_date)}</Badge>
                  <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
                  {s.curator_comment && <Badge tone="berry"><MessageSquare className="size-3" /> Пікір</Badge>}
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
          onClose={() => setOpen(null)}
          onDone={() => { setOpen(null); reload(true); }}
        />
      )}
    </div>
  );
}

function SubmissionModal({
  sub, mode, studentName, onClose, onDone,
}: { sub: Submission; mode: 'student' | 'curator'; studentName?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const t = sub.tasks!;
  const [comment, setComment] = useState(mode === 'student' ? sub.student_comment ?? '' : sub.curator_comment ?? '');
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (patch: Partial<Submission>, msg: string, key: string) => {
    setBusy(key);
    const { error } = await supabaseBrowser().from('task_submissions').update(patch).eq('id', sub.id);
    setBusy(null);
    if (error) return toast.error(humanError(error));
    toast.success(msg);
    onDone();
  };

  const canStudentAct = mode === 'student' && sub.status !== 'accepted';
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t.title}
      subtitle={mode === 'curator' && studentName ? studentName : `Берілген күні: ${shortDate(t.start_date)}`}
      footer={
        mode === 'student' ? (
          canStudentAct ? (
            <>
              {sub.status === 'pending_review' ? (
                <Button variant="secondary" loading={busy === 'undo'} onClick={() => update({ status: 'in_progress' }, 'Тапсыру кері қайтарылды', 'undo')}>
                  <Undo2 className="size-4" /> Тапсыруды кері қайтару
                </Button>
              ) : (
                <>
                  {sub.status !== 'in_progress' && (
                    <Button variant="secondary" loading={busy === 'start'} onClick={() => update({ status: 'in_progress' }, 'Тапсырма орындалуда', 'start')}>
                      <Play className="size-4" /> Орындауды бастау
                    </Button>
                  )}
                  <Button loading={busy === 'submit'} onClick={() => update({ status: 'pending_review', student_comment: comment.trim() || null }, 'Тапсырма куратордың тексеруіне жіберілді', 'submit')}>
                    <CheckCircle2 className="size-4" /> Орындалды
                  </Button>
                </>
              )}
            </>
          ) : <Button variant="secondary" onClick={onClose}>Жабу</Button>
        ) : (
          <>
            <Button variant="danger" loading={busy === 'rev'} onClick={() => {
              if (!comment.trim()) return toast.error('Қайта орындауға жіберу үшін пікір жазыңыз.');
              update({ status: 'needs_revision', curator_comment: comment.trim() }, 'Қайта орындауға жіберілді', 'rev');
            }}>
              <RotateCcw className="size-4" /> Қайта орындауға
            </Button>
            <Button loading={busy === 'acc'} disabled={sub.status === 'accepted'} onClick={() => update({ status: 'accepted', curator_comment: comment.trim() || null }, 'Тапсырма қабылданды', 'acc')}>
              <CheckCircle2 className="size-4" /> Қабылдау
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={SUBMISSION_STATUS[sub.status].tone}>{SUBMISSION_STATUS[sub.status].label}</Badge>
          <Badge tone={PRIORITY[t.priority].tone}>Маңыздылығы: {PRIORITY[t.priority].label}</Badge>
          <Badge><CalendarClock className="size-3" /> {shortDate(t.start_date)} – {shortDate(t.due_date)}</Badge>
        </div>
        {t.description && (
          <section>
            <h4 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Сипаттамасы</h4>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{t.description}</p>
          </section>
        )}
        {t.instructions && (
          <section className="rounded-2xl bg-berry-50 p-4">
            <h4 className="mb-1 text-xs font-bold tracking-wide text-berry-700 uppercase">Орындау нұсқаулығы</h4>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{t.instructions}</p>
          </section>
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
        {(mode === 'curator' || (canStudentAct && sub.status !== 'pending_review')) && (
          <Field label={mode === 'student' ? 'Куратор үшін түсініктеме (міндетті емес)' : 'Оқушыға пікір'}>
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000}
              placeholder={mode === 'student' ? 'Мысалы: барлық есептерді шығардым, 7-есепте сұрағым бар' : 'Мысалы: жарайсың! немесе 3-есепті қайта қара'} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export function CreateTaskModal({
  students, preselected = [], onClose, onCreated,
}: { students: { id: string; full_name: string }[]; preselected?: string[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const today = todayISO();
  const [f, setF] = useState({ title: '', description: '', instructions: '', start: today, due: addDays(today, 7), priority: 'medium' as Priority });
  const [ids, setIds] = useState<string[]>(preselected);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setErr(null); setF((s) => ({ ...s, [k]: v })); };

  const save = async () => {
    if (!f.title.trim()) return setErr('Тапсырма атауын енгізіңіз.');
    if (!f.due || f.due < f.start) return setErr('Соңғы мерзім басталу күнінен кейін болуы керек.');
    if (ids.length === 0) return setErr('Кемінде бір оқушыны таңдаңыз.');
    setSaving(true);
    const { error } = await supabaseBrowser().rpc('create_task', {
      p_title: f.title, p_description: f.description, p_instructions: f.instructions,
      p_start: f.start, p_due: f.due, p_priority: f.priority, p_students: ids,
    });
    setSaving(false);
    if (error) return setErr(humanError(error));
    toast.success(`Тапсырма ${ids.length} оқушыға берілді`);
    onCreated();
  };

  return (
    <Modal
      open onClose={onClose} size="lg" title="Жаңа тапсырма" subtitle="Бір немесе бірнеше оқушыға бір мезетте"
      footer={<><Button variant="secondary" onClick={onClose}>Бас тарту</Button><Button onClick={save} loading={saving}><Send className="size-4" /> Тапсырма беру</Button></>}
    >
      <div className="space-y-4">
        <Field label="Тапсырма атауы" required><Input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={200} placeholder="Мысалы: Квадрат теңдеулер — 15 есеп" /></Field>
        <Field label="Толық сипаттамасы"><Textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={8000} /></Field>
        <Field label="Орындау нұсқаулығы"><Textarea rows={3} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} maxLength={8000} placeholder="Қадамдар, дереккөздер, бағалау критерийлері" /></Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Басталу күні" required><Input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
          <Field label="Соңғы мерзім" required><Input type="date" value={f.due} min={f.start} onChange={(e) => set('due', e.target.value)} /></Field>
          <Field label="Маңыздылығы" className="col-span-2 sm:col-span-1">
            <Select value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
            </Select>
          </Field>
        </div>
        <Field group label="Оқушылар" required><StudentMultiSelect students={students} value={ids} onChange={(v) => { setErr(null); setIds(v); }} /></Field>
        {err && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  );
}

/** Куратордың өзі құрған тапсырмалары және әр оқушының статусы */
export function CuratorTaskCatalog({ curatorId, names }: { curatorId: string; names: Map<string, string> }) {
  const toast = useToast();
  const [del, setDel] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useLoad(async () => {
    const res = await supabaseBrowser().from('tasks').select('*, task_submissions(id, student_id, status)')
      .eq('curator_id', curatorId).order('created_at', { ascending: false });
    return must(res) as (Task & { task_submissions: { id: string; student_id: string; status: SubmissionStatus }[] })[];
  }, [curatorId]);
  useRealtime(['task_submissions'], () => reload(true));

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from('tasks').delete().eq('id', del.id);
    setBusy(false);
    if (error) return toast.error(humanError(error));
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
        return (
          <Card key={t.id} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-berry-900">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted">{shortDate(t.start_date)} – {shortDate(t.due_date)} · {subs.length} оқушы · {acc} қабылданды</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
                <button onClick={() => setDel(t)} aria-label="Өшіру" className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-bad-soft hover:text-bad"><Trash2 className="size-4" /></button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {subs.map((s) => (
                <Badge key={s.id} tone={SUBMISSION_STATUS[s.status].tone}>{names.get(s.student_id) ?? 'Оқушы'} · {SUBMISSION_STATUS[s.status].label}</Badge>
              ))}
            </div>
          </Card>
        );
      })}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} danger title="Тапсырманы өшіру"
        text={<>«<b>{del?.title}</b>» тапсырмасы барлық оқушылардан өшіріледі.</>} confirmLabel="Өшіру" />
    </div>
  );
}
