'use client';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { BookMarked, CalendarClock, Check, ClipboardCheck, ListChecks, Plus, Presentation, Trash2, UserPlus, X } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { addDays, hhmm, mondayOf, shortDate, todayISO, weekRange } from '@/lib/date';
import { ATTENDANCE, TRACKER_CATEGORY, TRACKER_TASK_TYPE } from '@/lib/labels';
import type { Attendance, Tracker, TrackerCategory, TrackerItem, TrackerProgress, TrackerTaskType } from '@/lib/types';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingBlock, ProgressBar, ProgressRing } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ConfirmModal, Modal } from '@/components/ui/modal';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { StudentMultiSelect } from './students';

const CAT_ICON: Record<TrackerCategory, React.ComponentType<{ className?: string }>> = {
  topic: BookMarked, task: ClipboardCheck, lesson: Presentation,
};

export interface TrackerWithItems extends Tracker { weekly_tracker_items: TrackerItem[] }

export function pct(done: number, total: number) {
  return total ? Math.round((done * 100) / total) : null;
}

/** Оқушыға тағайындалған трекерлер (ағымдағы + тарих) */
export function useStudentTrackers(studentId: string) {
  const q = useLoad(async () => {
    const sb = supabaseBrowser();
    const [a, p] = await Promise.all([
      sb.from('tracker_assignments').select('tracker_id, weekly_trackers(*, weekly_tracker_items(*))').eq('student_id', studentId),
      sb.from('tracker_progress').select('*').eq('student_id', studentId),
    ]);
    const trackers = (must(a) as unknown as { weekly_trackers: TrackerWithItems }[])
      .map((x) => x.weekly_trackers).filter(Boolean)
      .sort((x, y) => y.week_start.localeCompare(x.week_start));
    trackers.forEach((t) => t.weekly_tracker_items.sort((x, y) => x.sort_order - y.sort_order));
    return { trackers, progress: must(p) as TrackerProgress[] };
  }, [studentId]);
  useRealtime(['tracker_progress', 'tracker_assignments'], () => q.reload(true), `student_id=eq.${studentId}`);
  return q;
}

export function trackerStats(t: TrackerWithItems, progress: TrackerProgress[]) {
  const ids = new Set(t.weekly_tracker_items.map((i) => i.id));
  const done = progress.filter((p) => ids.has(p.item_id) && p.done).length;
  return { total: ids.size, done, pct: pct(done, ids.size) };
}

/** Бір трекерді толтыру/қарау */
export function TrackerSheet({
  tracker, progress, studentId, readOnly, onChanged,
}: { tracker: TrackerWithItems; progress: TrackerProgress[]; studentId: string; readOnly?: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const [local, setLocal] = useState<Record<string, Partial<TrackerProgress>>>({});
  const map = useMemo(() => {
    const m = new Map(progress.filter((p) => p.student_id === studentId).map((p) => [p.item_id, p]));
    return m;
  }, [progress, studentId]);
  const get = (id: string) => ({ ...(map.get(id) ?? { done: false, attendance: 'pending' as Attendance }), ...local[id] });
  const items = tracker.weekly_tracker_items;
  const done = items.filter((i) => get(i.id).done).length;
  const percent = pct(done, items.length);
  const current = todayISO() >= tracker.week_start && todayISO() <= tracker.week_end;

  const save = async (item: TrackerItem, patch: { done?: boolean; attendance?: Attendance }) => {
    const optimistic = { ...patch, ...(item.category === 'lesson' && patch.attendance ? { done: patch.attendance === 'attended' } : {}) };
    setLocal((l) => ({ ...l, [item.id]: { ...l[item.id], ...optimistic } }));
    const { error } = await supabaseBrowser().from('tracker_progress')
      .upsert({ item_id: item.id, student_id: studentId, ...patch }, { onConflict: 'item_id,student_id' });
    if (error) {
      setLocal((l) => { const n = { ...l }; delete n[item.id]; return n; });
      return toast.error(humanError(error));
    }
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 bg-brand-900 p-5 text-white sm:flex-row sm:items-center sm:p-6">
          <ProgressRing value={percent} light size={112} label="орындалды" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="soft">{weekRange(tracker.week_start)}</Badge>
              {current ? <Badge tone="soft">Ағымдағы апта</Badge> : <Badge tone="soft">{tracker.week_start > todayISO() ? 'Алдағы апта' : 'Тарих'}</Badge>}
            </div>
            <h2 className="mt-2 text-xl font-extrabold">{tracker.title}</h2>
            {tracker.description && <p className="mt-1 text-sm text-white/70">{tracker.description}</p>}
            <p className="mt-3 text-sm text-white/80">Апталық жоспар — <b>{items.length}</b> · Орындалғаны — <b>{done}</b> · Прогресс — <b>{percent ?? 0}%</b></p>
            <ProgressBar value={percent} tone="light" className="mt-2" />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {(['topic', 'task', 'lesson'] as TrackerCategory[]).map((cat) => {
          const list = items.filter((i) => i.category === cat);
          const Icon = CAT_ICON[cat];
          const d = list.filter((i) => get(i.id).done).length;
          return (
            <Card key={cat} className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-100 text-brand-700"><Icon className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-ink">{TRACKER_CATEGORY[cat]}</h3>
                  <p className="text-xs text-muted">{d} / {list.length}</p>
                </div>
              </div>
              {list.length === 0 ? (
                <p className="rounded-2xl bg-mist/60 px-3 py-4 text-center text-xs text-muted">Бұл бөлімде элемент жоқ</p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((it) => {
                    const st = get(it.id);
                    return (
                      <li key={it.id} className={clsx('rounded-2xl border p-3 transition-colors', st.done ? 'border-ok/25 bg-ok-soft/50' : 'border-line bg-white')}>
                        <div className="flex items-start gap-3">
                          {cat !== 'lesson' ? (
                            <button
                              disabled={readOnly}
                              onClick={() => save(it, { done: !st.done })}
                              aria-label={st.done ? 'Белгіні алу' : 'Орындалды деп белгілеу'}
                              aria-pressed={!!st.done}
                              className={clsx(
                                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all',
                                st.done ? 'border-ok bg-ok text-white' : 'border-brand-300 bg-white hover:border-brand-700',
                                readOnly && 'cursor-default',
                              )}
                            >
                              {st.done && <Check className="size-4" strokeWidth={3} />}
                            </button>
                          ) : (
                            <span className={clsx('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg', st.done ? 'bg-ok text-white' : st.attendance === 'missed' ? 'bg-bad-soft text-bad' : 'bg-mist text-muted')}>
                              {st.done ? <Check className="size-4" strokeWidth={3} /> : st.attendance === 'missed' ? <X className="size-4" /> : <CalendarClock className="size-3.5" />}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={clsx('text-sm font-semibold', st.done && cat !== 'lesson' ? 'text-muted line-through' : 'text-ink')}>{it.title}</p>
                            {it.description && <p className="mt-0.5 text-xs text-muted">{it.description}</p>}
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {it.task_type && <Badge tone="info">{TRACKER_TASK_TYPE[it.task_type]}</Badge>}
                              {cat === 'lesson' && (it.lesson_date || it.lesson_time) && (
                                <Badge><CalendarClock className="size-3" /> {it.lesson_date ? shortDate(it.lesson_date) : ''} {hhmm(it.lesson_time)}</Badge>
                              )}
                              {cat === 'lesson' && readOnly && <Badge tone={ATTENDANCE[st.attendance as Attendance].tone}>{ATTENDANCE[st.attendance as Attendance].label}</Badge>}
                            </div>
                            {cat === 'lesson' && !readOnly && (
                              <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Қатысу статусы">
                                {(['attended', 'missed'] as Attendance[]).map((a) => (
                                  <button
                                    key={a}
                                    role="radio"
                                    aria-checked={st.attendance === a}
                                    onClick={() => save(it, { attendance: st.attendance === a ? 'pending' : a })}
                                    className={clsx(
                                      'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
                                      st.attendance === a ? (a === 'attended' ? 'bg-ok text-white' : 'bg-bad text-white') : 'bg-mist text-ink hover:bg-mist-dark',
                                    )}
                                  >{ATTENDANCE[a].label}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Трекерлер тізімі (таңдау үшін) */
export function TrackerPicker({
  trackers, progress, value, onChange,
}: { trackers: TrackerWithItems[]; progress: TrackerProgress[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {trackers.map((t) => {
        const s = trackerStats(t, progress);
        const active = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={clsx('w-[210px] shrink-0 rounded-3xl p-3.5 text-left transition-all', active ? 'bg-brand-900 text-white shadow-lift' : 'bg-cream shadow-soft hover:shadow-lift')}
          >
            <p className={clsx('text-[11px] font-semibold', active ? 'text-white/75' : 'text-brand-700')}>{weekRange(t.week_start)}</p>
            <p className="mt-0.5 truncate text-sm font-bold">{t.title}</p>
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={s.pct} tone={active ? 'light' : 'brand'} className="flex-1" />
              <span className="text-xs font-bold">{s.pct ?? 0}%</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------- Куратор: трекер құрастыру ----------------
interface DraftItem { key: string; category: TrackerCategory; task_type: TrackerTaskType | ''; title: string; description: string; lesson_date: string; lesson_time: string }
let k = 0;
const blank = (category: TrackerCategory, week: string): DraftItem => ({
  key: `i${++k}`, category, task_type: category === 'task' ? 'test' : '', title: '', description: '', lesson_date: category === 'lesson' ? week : '', lesson_time: '',
});

export function TrackerBuilderModal({
  students, onClose, onCreated, copyFrom,
}: { students: { id: string; full_name: string }[]; onClose: () => void; onCreated: (id: string) => void; copyFrom?: TrackerWithItems | null }) {
  const toast = useToast();
  const thisMonday = mondayOf(todayISO());
  const startWeek = copyFrom ? addDays(mondayOf(copyFrom.week_start) > thisMonday ? mondayOf(copyFrom.week_start) : thisMonday, copyFrom ? 7 : 0) : thisMonday;
  const [title, setTitle] = useState(copyFrom ? copyFrom.title : '');
  const [description, setDescription] = useState(copyFrom?.description ?? '');
  const [week, setWeek] = useState(startWeek);
  const [items, setItems] = useState<DraftItem[]>(
    copyFrom
      ? copyFrom.weekly_tracker_items.map((i) => ({
          key: `i${++k}`, category: i.category, task_type: i.task_type ?? '', title: i.title, description: i.description ?? '',
          lesson_date: i.lesson_date ? addDays(i.lesson_date, 7) : '', lesson_time: hhmm(i.lesson_time),
        }))
      : [blank('topic', startWeek), blank('task', startWeek), blank('lesson', startWeek)],
  );
  const [ids, setIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const upd = (key: string, patch: Partial<DraftItem>) => { setErr(null); setItems((l) => l.map((i) => (i.key === key ? { ...i, ...patch } : i))); };

  const save = async () => {
    const clean = items.filter((i) => i.title.trim());
    if (!title.trim()) return setErr('Трекер атауын енгізіңіз.');
    if (clean.length === 0) return setErr('Кемінде бір элемент қосыңыз.');
    setSaving(true);
    const { data, error } = await supabaseBrowser().rpc('create_tracker', {
      p_title: title, p_description: description, p_week_start: week,
      p_items: clean.map((i) => ({
        category: i.category, task_type: i.category === 'task' ? i.task_type || 'extra' : '', title: i.title,
        description: i.description, lesson_date: i.category === 'lesson' ? i.lesson_date : '', lesson_time: i.category === 'lesson' ? i.lesson_time : '',
      })),
      p_students: ids,
    });
    setSaving(false);
    if (error) return setErr(humanError(error));
    toast.success(ids.length ? `Трекер ${ids.length} оқушыға жарияланды` : 'Трекер сақталды');
    onCreated(data as string);
  };

  return (
    <Modal
      open onClose={onClose} size="xl" title={copyFrom ? 'Трекерді көшіру' : 'Жаңа апталық трекер'} subtitle="Тақырыптар, тапсырмалар және сабақтар"
      footer={<><Button variant="secondary" onClick={onClose}>Бас тарту</Button><Button onClick={save} loading={saving}>Сақтау және жариялау</Button></>}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="Трекер атауы" required><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Мысалы: Қараша, 3-апта" /></Field>
          <Field label="Апта (дүйсенбі)" required hint={weekRange(week)}>
            <Input type="date" value={week} onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))} />
          </Field>
        </div>
        <Field label="Сипаттамасы"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></Field>

        {(['topic', 'task', 'lesson'] as TrackerCategory[]).map((cat) => {
          const Icon = CAT_ICON[cat];
          const list = items.filter((i) => i.category === cat);
          return (
            <section key={cat} className="rounded-3xl bg-white p-3 ring-1 ring-line sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-bold text-ink"><Icon className="size-4 text-brand-700" /> {TRACKER_CATEGORY[cat]} <span className="text-muted">({list.length})</span></h4>
                <Button size="sm" variant="soft" onClick={() => setItems((l) => [...l, blank(cat, week)])}><Plus className="size-3.5" /> Қосу</Button>
              </div>
              <div className="space-y-2">
                {list.map((i) => (
                  <div key={i.key} className="grid gap-2 rounded-2xl bg-mist/50 p-2.5 sm:grid-cols-12">
                    <Input className={cat === 'topic' ? 'sm:col-span-5' : 'sm:col-span-4'} value={i.title} onChange={(e) => upd(i.key, { title: e.target.value })}
                      placeholder={cat === 'topic' ? 'Тақырып атауы' : cat === 'task' ? 'Тапсырма атауы' : 'Сабақ атауы'} maxLength={200} />
                    {cat === 'task' && (
                      <Select className="sm:col-span-3" value={i.task_type} onChange={(e) => upd(i.key, { task_type: e.target.value as TrackerTaskType })}>
                        {(Object.keys(TRACKER_TASK_TYPE) as TrackerTaskType[]).map((t) => <option key={t} value={t}>{TRACKER_TASK_TYPE[t]}</option>)}
                      </Select>
                    )}
                    {cat === 'lesson' && (
                      <>
                        <Input type="date" className="sm:col-span-3" value={i.lesson_date} min={week} max={addDays(week, 6)} onChange={(e) => upd(i.key, { lesson_date: e.target.value })} />
                        <Input type="time" className="sm:col-span-2" value={i.lesson_time} onChange={(e) => upd(i.key, { lesson_time: e.target.value })} />
                      </>
                    )}
                    <Input className={cat === 'topic' ? 'sm:col-span-6' : cat === 'task' ? 'sm:col-span-4' : 'sm:col-span-2'} value={i.description}
                      onChange={(e) => upd(i.key, { description: e.target.value })} placeholder="Қысқаша сипаттама" maxLength={2000} />
                    <button onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} aria-label="Өшіру"
                      className="flex h-11 items-center justify-center rounded-2xl text-muted hover:bg-bad-soft hover:text-bad sm:col-span-1">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                {list.length === 0 && <p className="py-2 text-center text-xs text-muted">Элемент жоқ</p>}
              </div>
            </section>
          );
        })}

        <Field group label="Оқушыларға тағайындау" hint="Кейін де тағайындауға болады">
          <StudentMultiSelect students={students} value={ids} onChange={setIds} />
        </Field>
        {err && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  );
}

// ---------------- Куратор: трекер бойынша бақылау ----------------
export function CuratorTrackerDetail({
  tracker, students, onDeleted, onCopy,
}: { tracker: TrackerWithItems; students: { id: string; full_name: string }[]; onDeleted: () => void; onCopy: () => void }) {
  const toast = useToast();
  const [assignOpen, setAssignOpen] = useState(false);
  const [newIds, setNewIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [view, setView] = useState<string | null>(null);

  const { data, error, loading, reload } = useLoad(async () => {
    const sb = supabaseBrowser();
    const itemIds = tracker.weekly_tracker_items.map((i) => i.id);
    const [a, p] = await Promise.all([
      sb.from('tracker_assignments').select('student_id, assigned_at').eq('tracker_id', tracker.id),
      itemIds.length ? sb.from('tracker_progress').select('*').in('item_id', itemIds) : Promise.resolve({ data: [], error: null }),
    ]);
    return { assigned: must(a) as { student_id: string; assigned_at: string }[], progress: must(p) as TrackerProgress[] };
  }, [tracker.id]);
  useRealtime(['tracker_progress', 'tracker_assignments'], () => reload(true));

  const names = new Map(students.map((s) => [s.id, s.full_name]));
  const assignedIds = data?.assigned.map((a) => a.student_id) ?? [];
  const items = tracker.weekly_tracker_items;

  const assign = async () => {
    if (!newIds.length) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from('tracker_assignments').insert(newIds.map((id) => ({ tracker_id: tracker.id, student_id: id })));
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success('Трекер тағайындалды');
    setAssignOpen(false); setNewIds([]); reload(true);
  };
  const unassign = async (sid: string) => {
    const { error } = await supabaseBrowser().from('tracker_assignments').delete().eq('tracker_id', tracker.id).eq('student_id', sid);
    if (error) return toast.error(humanError(error));
    toast.success('Тағайындау алынып тасталды');
    reload(true);
  };
  const remove = async () => {
    setBusy(true);
    const { error } = await supabaseBrowser().from('weekly_trackers').delete().eq('id', tracker.id);
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success('Трекер өшірілді');
    onDeleted();
  };

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Badge tone="brand">{weekRange(tracker.week_start)}</Badge>
          <h2 className="mt-2 text-xl font-extrabold text-ink">{tracker.title}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {items.filter((i) => i.category === 'topic').length} тақырып · {items.filter((i) => i.category === 'task').length} тапсырма · {items.filter((i) => i.category === 'lesson').length} сабақ
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setAssignOpen(true)}><UserPlus className="size-4" /> Тағайындау</Button>
          <Button size="sm" variant="secondary" onClick={onCopy}>Келесі аптаға көшіру</Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmDel(true)}><Trash2 className="size-4" /></Button>
        </div>
      </div>

      <h3 className="mt-6 mb-3 text-sm font-bold text-ink">Оқушылардың толтыру барысы <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-ok"><span className="size-1.5 animate-pulse rounded-full bg-ok" /> тікелей</span></h3>
      {loading ? <LoadingBlock rows={2} /> : error ? <ErrorState text={error} onRetry={reload} /> : assignedIds.length === 0 ? (
        <EmptyState icon={ListChecks} title="Трекер әлі ешкімге тағайындалмаған" action={<Button size="sm" variant="soft" onClick={() => setAssignOpen(true)}>Оқушы таңдау</Button>} />
      ) : (
        <div className="space-y-2">
          {data!.assigned.map(({ student_id }) => {
            const prog = data!.progress.filter((p) => p.student_id === student_id);
            const done = prog.filter((p) => p.done).length;
            const value = pct(done, items.length);
            const last = prog.reduce<string | null>((m, p) => (!m || p.updated_at > m ? p.updated_at : m), null);
            return (
              <div key={student_id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
                <Avatar name={names.get(student_id) ?? '?'} size={36} />
                <div className="min-w-[140px] flex-1">
                  <p className="truncate text-sm font-bold text-ink">{names.get(student_id) ?? 'Оқушы'}</p>
                  <p className="text-[11px] text-muted">{last ? `Соңғы белгі: ${shortDate(last)}` : 'Әлі толтырылмаған'}</p>
                </div>
                <div className="flex w-full items-center gap-3 sm:w-64">
                  <ProgressBar value={value} className="flex-1" />
                  <span className="w-20 text-right text-xs font-bold text-ink">{done}/{items.length} · {value ?? 0}%</span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setView(student_id)}>Толығырақ</Button>
                  <button onClick={() => unassign(student_id)} aria-label="Тағайындауды алу" className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-bad-soft hover:text-bad"><X className="size-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Трекерді тағайындау" subtitle={tracker.title}
        footer={<><Button variant="secondary" onClick={() => setAssignOpen(false)}>Бас тарту</Button><Button onClick={assign} loading={busy} disabled={!newIds.length}>Тағайындау</Button></>}>
        <StudentMultiSelect students={students} value={newIds} onChange={setNewIds} disabledIds={assignedIds} />
      </Modal>
      {view && data && (
        <Modal open onClose={() => setView(null)} size="xl" title={names.get(view) ?? 'Оқушы'} subtitle="Трекердің толтырылуы">
          <TrackerSheet tracker={tracker} progress={data.progress} studentId={view} readOnly />
        </Modal>
      )}
      <ConfirmModal open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={remove} loading={busy} danger title="Трекерді өшіру"
        text="Трекер және оқушылардың белгілері біржола өшіріледі." confirmLabel="Өшіру" />
    </Card>
  );
}
