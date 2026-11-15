'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Lock, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { MONTHS, WEEKDAYS_SHORT, hhmm, longDate, monthGrid, parseISO, todayISO } from '@/lib/date';
import { PLAN_STATUS, PRIORITY } from '@/lib/labels';
import type { Plan, PlanStatus, Priority } from '@/lib/types';
import { Badge, Card, EmptyState, ErrorState, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Modal, ConfirmModal } from '@/components/ui/modal';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

type Mode = 'student' | 'curator';

export function Planner({ studentId, mode }: { studentId: string; mode: Mode }) {
  const params = useSearchParams();
  const initial = params.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date')!) ? params.get('date')! : todayISO();
  const [selected, setSelected] = useState(initial);
  const [cursor, setCursor] = useState(() => { const d = parseISO(initial); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const today = todayISO();

  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const from = grid[0];
  const to = grid[grid.length - 1];

  const { data: plans, error, loading, reload } = useLoad(async () => {
    const res = await supabaseBrowser().from('plans').select('*').eq('student_id', studentId)
      .gte('plan_date', from).lte('plan_date', to)
      .order('plan_date').order('start_time', { nullsFirst: false });
    return must(res) as Plan[];
  }, [studentId, from, to]);

  useRealtime(['plans'], () => reload(true), `student_id=eq.${studentId}`);

  const byDay = useMemo(() => {
    const m = new Map<string, Plan[]>();
    (plans ?? []).forEach((p) => m.set(p.plan_date, [...(m.get(p.plan_date) ?? []), p]));
    return m;
  }, [plans]);

  const dayPlans = byDay.get(selected) ?? [];
  const move = (delta: number) => setCursor(({ y, m }) => {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const goToday = () => { const d = parseISO(today); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setSelected(today); };

  return (
    <div className="grid gap-4 2xl:grid-cols-[1fr_360px]">
      <Card className="p-3 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
          <h2 className="text-lg font-extrabold text-berry-900 sm:text-xl">{MONTHS[cursor.m]} {cursor.y}</h2>
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={goToday}>Бүгін</Button>
            <Button variant="secondary" size="icon" className="!size-9" onClick={() => move(-1)} aria-label="Алдыңғы ай"><ChevronLeft className="size-4" /></Button>
            <Button variant="secondary" size="icon" className="!size-9" onClick={() => move(1)} aria-label="Келесі ай"><ChevronRight className="size-4" /></Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS_SHORT.map((d, i) => (
            <div key={d} className={clsx('pb-1 text-center text-[11px] font-bold uppercase', i >= 5 ? 'text-berry-500' : 'text-muted')}>{d}</div>
          ))}
          {grid.map((iso) => {
            const d = parseISO(iso);
            const inMonth = d.getMonth() === cursor.m;
            const items = byDay.get(iso) ?? [];
            const isSel = iso === selected;
            const isToday = iso === today;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                onDoubleClick={() => { setSelected(iso); setEditing('new'); }}
                aria-label={`${longDate(iso)}${items.length ? `, ${items.length} жоспар` : ''}`}
                aria-pressed={isSel}
                className={clsx(
                  'group relative flex min-h-[52px] flex-col rounded-xl p-1 text-left transition-all sm:min-h-[96px] sm:rounded-2xl sm:p-1.5',
                  isSel ? 'bg-berry-50 ring-2 ring-berry-700' : 'bg-white hover:ring-1 hover:ring-berry-300',
                  !inMonth && 'opacity-45',
                )}
              >
                <span className={clsx(
                  'flex size-6 items-center justify-center self-center rounded-full text-xs font-bold sm:size-7 sm:self-start',
                  isToday ? 'bg-berry-900 text-white' : 'text-berry-900',
                )}>{d.getDate()}</span>
                {/* Мобильді: нүктелер */}
                <span className="mt-auto flex justify-center gap-0.5 pb-0.5 sm:hidden">
                  {items.slice(0, 3).map((p) => (
                    <span key={p.id} className={clsx('size-1.5 rounded-full', p.creator_role === 'curator' ? 'bg-berry-900' : 'bg-berry-300', p.status === 'done' && 'opacity-40')} />
                  ))}
                </span>
                {/* Үлкен экран: атаулар */}
                <span className="mt-1 hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {items.slice(0, 2).map((p) => (
                    <span
                      key={p.id}
                      className={clsx(
                        'truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                        p.creator_role === 'curator' ? 'bg-berry-900 text-white' : 'bg-berry-200 text-berry-950',
                        p.status === 'done' && 'line-through opacity-50',
                      )}
                     title={p.title}>{p.title}</span>
                  ))}
                  {items.length > 2 && <span className="px-1 text-[10px] font-semibold text-muted">+{items.length - 2}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 px-1 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-berry-300" /> Оқушы жасаған</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-berry-900" /> Куратор жасаған</span>
          <span className="hidden sm:inline">Күнді екі рет басып, жылдам жоспар қосыңыз</span>
        </div>
      </Card>

      <Card className="flex flex-col p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted">{selected === today ? 'Бүгін' : 'Таңдалған күн'}</p>
            <h3 className="text-lg font-extrabold text-berry-900">{longDate(selected)}</h3>
          </div>
          <Button size="sm" onClick={() => setEditing('new')}><Plus className="size-4" /> Жоспар</Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : error ? (
          <ErrorState text={error} onRetry={reload} />
        ) : dayPlans.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Бұл күнге жоспар жоқ"
            text={mode === 'curator' ? 'Оқушыға осы күнге жоспар құрастырыңыз.' : 'Күніңізді жоспарлап, мақсатыңызға жақындаңыз.'}
            action={<Button size="sm" variant="soft" onClick={() => setEditing('new')}><Plus className="size-4" /> Жоспар қосу</Button>}
          />
        ) : (
          <div className="space-y-2">
            {dayPlans.map((p) => <PlanRow key={p.id} plan={p} mode={mode} onOpen={() => setEditing(p)} onChanged={() => reload(true)} />)}
          </div>
        )}
      </Card>

      {editing && (
        <PlanModal
          plan={editing === 'new' ? null : editing}
          date={selected}
          studentId={studentId}
          mode={mode}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(true); }}
        />
      )}
    </div>
  );
}

const STATUS_ORDER: PlanStatus[] = ['todo', 'in_progress', 'done'];

function PlanRow({ plan, mode, onOpen, onChanged }: { plan: Plan; mode: Mode; onOpen: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const cycle = async () => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(plan.status) + 1) % 3];
    setBusy(true);
    const { error } = await supabaseBrowser().from('plans').update({ status: next }).eq('id', plan.id);
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success(`Статус: ${PLAN_STATUS[next].label}`);
    onChanged();
  };
  return (
    <div className={clsx('group rounded-2xl border p-3 transition-colors', plan.creator_role === 'curator' ? 'border-berry-200 bg-berry-50/60' : 'border-line bg-white')}>
      <div className="flex items-start gap-3">
        <button
          onClick={cycle}
          disabled={busy || mode === 'curator'}
          title={mode === 'student' ? 'Статусты ауыстыру' : PLAN_STATUS[plan.status].label}
          aria-label={`Статус: ${PLAN_STATUS[plan.status].label}`}
          className={clsx(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            plan.status === 'done' && 'border-ok bg-ok text-white',
            plan.status === 'in_progress' && 'border-warn bg-warn-soft',
            plan.status === 'todo' && 'border-berry-300 bg-white hover:border-berry-700',
          )}
        >
          {plan.status === 'done' && <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.5}><path d="m5 12 5 5 9-10" /></svg>}
          {plan.status === 'in_progress' && <span className="size-2 rounded-full bg-warn" />}
        </button>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className={clsx('text-sm font-bold text-berry-900', plan.status === 'done' && 'text-muted line-through')}>{plan.title}</p>
          {plan.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{plan.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(plan.start_time || plan.end_time) && (
              <Badge><Clock className="size-3" /> {hhmm(plan.start_time)}{plan.end_time ? `–${hhmm(plan.end_time)}` : ''}</Badge>
            )}
            <Badge tone={PRIORITY[plan.priority].tone}>{PRIORITY[plan.priority].label}</Badge>
            <Badge tone={PLAN_STATUS[plan.status].tone}>{PLAN_STATUS[plan.status].label}</Badge>
            <Badge tone={plan.creator_role === 'curator' ? 'berry' : 'neutral'}>
              <UserRound className="size-3" /> {plan.creator_role === 'curator' ? 'Куратор жасаған' : 'Оқушы жасаған'}
            </Badge>
          </div>
        </button>
        <button onClick={onOpen} aria-label="Ашу" className="hidden size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-berry-100 group-hover:flex">
          <Pencil className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function PlanModal({
  plan, date, studentId, mode, onClose, onSaved,
}: { plan: Plan | null; date: string; studentId: string; mode: Mode; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const locked = mode === 'student' && plan?.creator_role === 'curator';
  const canDelete = plan && (mode === 'curator' || plan.creator_role === 'student');
  const [f, setF] = useState({
    title: plan?.title ?? '',
    description: plan?.description ?? '',
    plan_date: plan?.plan_date ?? date,
    start_time: hhmm(plan?.start_time) ?? '',
    end_time: hhmm(plan?.end_time) ?? '',
    priority: (plan?.priority ?? 'medium') as Priority,
    status: (plan?.status ?? 'todo') as PlanStatus,
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => setErr(null), [f]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (!locked) {
      if (!f.title.trim()) return setErr('Жоспар атауын енгізіңіз.');
      if (!f.plan_date) return setErr('Күнді таңдаңыз.');
      if (f.start_time && f.end_time && f.end_time <= f.start_time) return setErr('Аяқталу уақыты басталу уақытынан кейін болуы керек.');
    }
    setSaving(true);
    const sb = supabaseBrowser();
    const payload = locked
      ? { status: f.status }
      : {
          title: f.title.trim(), description: f.description.trim() || null, plan_date: f.plan_date,
          start_time: f.start_time || null, end_time: f.end_time || null, priority: f.priority, status: f.status,
        };
    const { error } = plan
      ? await sb.from('plans').update(payload).eq('id', plan.id)
      : await sb.from('plans').insert({ ...payload, student_id: studentId, creator_role: mode });
    setSaving(false);
    if (error) return setErr(humanError(error));
    toast.success(plan ? 'Жоспар сақталды' : mode === 'curator' ? 'Жоспар оқушының күнтізбесіне қосылды' : 'Жоспар қосылды');
    onSaved();
  };

  const remove = async () => {
    if (!plan) return;
    setSaving(true);
    const { error } = await supabaseBrowser().from('plans').delete().eq('id', plan.id);
    setSaving(false);
    if (error) return toast.error(humanError(error));
    toast.success('Жоспар өшірілді');
    onSaved();
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={plan ? (locked ? 'Куратор жоспары' : 'Жоспарды өңдеу') : 'Жаңа жоспар'}
        subtitle={plan ? `${plan.creator_role === 'curator' ? 'Куратор' : 'Оқушы'} жасаған` : longDate(f.plan_date)}
        footer={
          <>
            {canDelete && (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirmDel(true)}><Trash2 className="size-4" /> Өшіру</Button>
            )}
            <Button variant="secondary" onClick={onClose}>Бас тарту</Button>
            <Button onClick={save} loading={saving}>Сақтау</Button>
          </>
        }
      >
        {locked && (
          <p className="mb-4 flex items-start gap-2 rounded-2xl bg-berry-50 px-4 py-3 text-xs text-berry-800">
            <Lock className="mt-0.5 size-3.5 shrink-0" /> Бұл жоспарды куратор құрған. Сіз тек орындалу статусын белгілей аласыз.
          </p>
        )}
        <div className="space-y-4">
          <Field label="Жоспар атауы" required>
            <Input value={f.title} onChange={(e) => set('title', e.target.value)} disabled={locked} maxLength={200} placeholder="Мысалы: Алгебра — 20 есеп" />
          </Field>
          <Field label="Тапсырма сипаттамасы">
            <Textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} disabled={locked} maxLength={4000} />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Күні" required className="col-span-2 sm:col-span-1">
              <Input type="date" value={f.plan_date} onChange={(e) => set('plan_date', e.target.value)} disabled={locked} />
            </Field>
            <Field label="Басталуы"><Input type="time" value={f.start_time} onChange={(e) => set('start_time', e.target.value)} disabled={locked} /></Field>
            <Field label="Аяқталуы"><Input type="time" value={f.end_time} onChange={(e) => set('end_time', e.target.value)} disabled={locked} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Маңыздылығы">
              <Select value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)} disabled={locked}>
                {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
              </Select>
            </Field>
            <Field label="Орындалу статусы">
              <Select value={f.status} onChange={(e) => set('status', e.target.value as PlanStatus)}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{PLAN_STATUS[s].label}</option>)}
              </Select>
            </Field>
          </div>
          {err && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
        </div>
      </Modal>
      <ConfirmModal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={remove}
        loading={saving}
        danger
        title="Жоспарды өшіру"
        text={<>«<b>{plan?.title}</b>» жоспары біржола өшіріледі.</>}
        confirmLabel="Өшіру"
      />
    </>
  );
}
