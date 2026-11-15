'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, CircleDot, Clock, Lock, NotebookPen, Pencil, Plus, RotateCcw, StickyNote, Trash2,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { MONTHS, MONTHS_GEN, WEEKDAYS, WEEKDAYS_SHORT, addDays, hhmm, longDate, mondayOf, monthGrid, parseISO, todayISO, weekdayIndex } from '@/lib/date';
import { PLAN_STATUS, PRIORITY } from '@/lib/labels';
import type { Plan, PlanStatus, Priority } from '@/lib/types';
import { Card, EmptyState, ErrorState, LoadingBlock } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Modal, ConfirmModal } from '@/components/ui/modal';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { ActionMenu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';

type Mode = 'student' | 'curator';
const STATUS_ORDER: PlanStatus[] = ['todo', 'in_progress', 'done'];

/** Уақыт бойынша реттеу: уақыты барлары алдымен, содан кейін уақытсыздар */
const byTime = (a: Plan, b: Plan) =>
  (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || (a.end_time ?? '').localeCompare(b.end_time ?? '') || a.created_at.localeCompare(b.created_at);

function dayTitle(iso: string) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WEEKDAYS[weekdayIndex(iso)].toLowerCase()}`;
}

export function Planner({ studentId, mode }: { studentId: string; mode: Mode }) {
  const params = useSearchParams();
  const qd = params.get('date');
  const initial = qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : todayISO();
  const [selected, setSelected] = useState(initial);
  const [cursor, setCursor] = useState(() => { const d = parseISO(initial); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const today = todayISO();

  // Таңдалған күн өзгерсе, күнтізбе де сол айға ауысады
  useEffect(() => { const d = parseISO(selected); setCursor({ y: d.getFullYear(), m: d.getMonth() }); }, [selected]);

  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const week = useMemo(() => { const m = mondayOf(selected); return Array.from({ length: 7 }, (_, i) => addDays(m, i)); }, [selected]);
  const from = grid[0] < week[0] ? grid[0] : week[0];
  const to = grid[grid.length - 1] > week[6] ? grid[grid.length - 1] : week[6];

  const { data: plans, error, loading, reload } = useLoad(async () => {
    const res = await supabaseBrowser().from('plans').select('*').eq('student_id', studentId)
      .gte('plan_date', from).lte('plan_date', to).order('plan_date');
    return must(res) as Plan[];
  }, [studentId, from, to]);
  useRealtime(['plans'], () => reload(true), `student_id=eq.${studentId}`);

  const byDay = useMemo(() => {
    const m = new Map<string, Plan[]>();
    (plans ?? []).forEach((p) => m.set(p.plan_date, [...(m.get(p.plan_date) ?? []), p]));
    m.forEach((v) => v.sort(byTime));
    return m;
  }, [plans]);
  const dayPlans = byDay.get(selected) ?? [];
  const doneCount = dayPlans.filter((p) => p.status === 'done').length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {/* Күн навигациясы */}
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon" className="!size-10 shrink-0" onClick={() => setSelected(addDays(selected, -1))} aria-label="Алдыңғы күн"><ChevronLeft className="size-5" /></Button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[11px] font-semibold text-muted">{selected === today ? 'Бүгін' : selected === addDays(today, 1) ? 'Ертең' : selected === addDays(today, -1) ? 'Кеше' : `${MONTHS[parseISO(selected).getMonth()]} ${parseISO(selected).getFullYear()}`}</p>
              <h2 className="truncate text-base font-extrabold text-ink sm:text-lg" data-testid="plan-day-title">{dayTitle(selected)}</h2>
            </div>
            <Button variant="secondary" size="icon" className="!size-10 shrink-0" onClick={() => setSelected(addDays(selected, 1))} aria-label="Келесі күн"><ChevronRight className="size-5" /></Button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1" role="tablist" aria-label="Апта күндері">
            {week.map((iso, i) => {
              const n = byDay.get(iso)?.length ?? 0;
              const on = iso === selected;
              return (
                <button key={iso} type="button" role="tab" aria-selected={on} onClick={() => setSelected(iso)}
                  aria-label={`${longDate(iso)}${n ? `, ${n} жоспар` : ''}`}
                  className={clsx('flex flex-col items-center gap-0.5 rounded-2xl py-2 transition',
                    on ? 'bg-brand-900 text-white' : 'text-ink hover:bg-mist', iso === today && !on && 'ring-1 ring-brand-300')}>
                  <span className={clsx('text-[10px] font-semibold uppercase', on ? 'text-white/70' : i >= 5 ? 'text-brand-500' : 'text-muted')}>{WEEKDAYS_SHORT[i]}</span>
                  <span className="text-sm font-bold">{parseISO(iso).getDate()}</span>
                  <span className={clsx('h-1.5 w-1.5 rounded-full', n ? (on ? 'bg-white' : 'bg-brand-700') : 'bg-transparent')} />
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {selected !== today && <Button size="sm" variant="ghost" onClick={() => setSelected(today)}>Бүгінге оралу</Button>}
            <Button size="sm" variant="ghost" className="xl:hidden" onClick={() => setCalOpen((v) => !v)} aria-expanded={calOpen}>
              <CalendarDays className="size-4" /> {calOpen ? 'Күнтізбені жасыру' : 'Ай күнтізбесі'}
            </Button>
            <Button size="sm" className="ml-auto" onClick={() => setEditing('new')} data-testid="plan-add"><Plus className="size-4" /> Жоспар қосу</Button>
          </div>
          {calOpen && (
            <div className="mt-3 border-t border-line pt-3 xl:hidden">
              <MonthCalendar cursor={cursor} setCursor={setCursor} grid={grid} byDay={byDay} selected={selected} today={today}
                onPick={(iso) => { setSelected(iso); setCalOpen(false); }} />
            </div>
          )}
        </Card>

        {/* Күннің жоспарлары — жеке жолақтар */}
        <section aria-label={`${dayTitle(selected)} жоспары`}>
          <div className="mb-2 flex items-end justify-between gap-2 px-1">
            <h3 className="text-sm font-bold text-ink">{selected === today ? 'Бүгінгі жоспар' : 'Күннің жоспары'}</h3>
            {dayPlans.length > 0 && <p className="text-xs font-semibold text-muted" data-testid="plan-progress">{doneCount}/{dayPlans.length} орындалды</p>}
          </div>
          {loading ? <LoadingBlock rows={3} /> : error ? <ErrorState text={error} onRetry={reload} /> : dayPlans.length === 0 ? (
            <Card className="p-2">
              <EmptyState icon={CalendarDays} title="Бұл күнге жоспар жоқ"
                text={mode === 'curator' ? 'Оқушыға осы күнге жоспар құрыңыз — ол оқушы кабинетінде бірден көрінеді.' : 'Күніңізді жоспарлап, уақытыңызды тиімді пайдаланыңыз.'}
                action={<Button size="sm" variant="soft" onClick={() => setEditing('new')}><Plus className="size-4" /> Жоспар қосу</Button>} />
            </Card>
          ) : (
            <ol className="space-y-2.5">
              {dayPlans.map((p) => <PlanStrip key={p.id} plan={p} mode={mode} onEdit={() => setEditing(p)} onChanged={() => reload(true)} />)}
            </ol>
          )}
        </section>
      </div>

      {/* Ай күнтізбесі (үлкен экран) */}
      <Card className="hidden h-fit p-4 xl:block">
        <MonthCalendar cursor={cursor} setCursor={setCursor} grid={grid} byDay={byDay} selected={selected} today={today} onPick={setSelected} />
        <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs text-muted">
          <p className="flex items-center gap-2"><span className="h-3 w-1 rounded-full bg-brand-900" /> Куратор жасаған</p>
          <p className="flex items-center gap-2"><span className="h-3 w-1 rounded-full bg-brand-300" /> Оқушы жасаған</p>
        </div>
      </Card>

      {editing && (
        <PlanModal plan={editing === 'new' ? null : editing} date={selected} studentId={studentId} mode={mode}
          onClose={() => setEditing(null)}
          onSaved={(d) => { setEditing(null); if (d) setSelected(d); reload(true); }} />
      )}
    </div>
  );
}

function MonthCalendar({ cursor, setCursor, grid, byDay, selected, today, onPick }: {
  cursor: { y: number; m: number }; setCursor: (c: { y: number; m: number }) => void; grid: string[];
  byDay: Map<string, Plan[]>; selected: string; today: string; onPick: (iso: string) => void;
}) {
  const move = (delta: number) => { const d = new Date(cursor.y, cursor.m + delta, 1); setCursor({ y: d.getFullYear(), m: d.getMonth() }); };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-extrabold text-ink">{MONTHS[cursor.m]} {cursor.y}</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => move(-1)} aria-label="Алдыңғы ай" className="flex size-8 items-center justify-center rounded-full hover:bg-mist"><ChevronLeft className="size-4" /></button>
          <button type="button" onClick={() => move(1)} aria-label="Келесі ай" className="flex size-8 items-center justify-center rounded-full hover:bg-mist"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS_SHORT.map((d) => <span key={d} className="pb-1 text-[10px] font-bold text-muted uppercase">{d}</span>)}
        {grid.map((iso) => {
          const d = parseISO(iso);
          const items = byDay.get(iso) ?? [];
          const inMonth = d.getMonth() === cursor.m;
          const on = iso === selected;
          return (
            <button key={iso} type="button" onClick={() => onPick(iso)} aria-label={`${longDate(iso)}${items.length ? `, ${items.length} жоспар` : ''}`} aria-pressed={on}
              className={clsx('flex h-10 flex-col items-center justify-center rounded-xl text-xs font-semibold transition',
                on ? 'bg-brand-900 text-white' : iso === today ? 'bg-brand-50 text-brand-900' : 'text-ink hover:bg-mist', !inMonth && !on && 'opacity-35')}>
              {d.getDate()}
              <span className="mt-0.5 flex h-1 gap-0.5">
                {items.slice(0, 3).map((p) => <span key={p.id} className={clsx('size-1 rounded-full', on ? 'bg-white' : p.creator_role === 'curator' ? 'bg-brand-900' : 'bg-brand-300')} />)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_VIEW: Record<PlanStatus, { label: string; icon: React.ReactNode; pill: string }> = {
  done: { label: 'Орындалды', icon: <Check className="size-3.5" strokeWidth={3} />, pill: 'bg-ok-soft text-ok' },
  in_progress: { label: 'Орындалуда', icon: <CircleDot className="size-3.5" />, pill: 'bg-warn-soft text-warn' },
  todo: { label: 'Орындалмаған', icon: <span className="size-2.5 rounded-full border-2 border-current" />, pill: 'bg-mist text-muted' },
};

/** Бір жоспар — жеке жолақ: уақыт, атауы, статусы, кім жасағаны, әрекеттер */
function PlanStrip({ plan, mode, onEdit, onChanged }: { plan: Plan; mode: Mode; onEdit: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const done = plan.status === 'done';
  const byCurator = plan.creator_role === 'curator';
  const canEdit = mode === 'curator' || !byCurator;
  const canDelete = mode === 'curator' || !byCurator;
  const st = STATUS_VIEW[plan.status];

  const setStatus = async (next: PlanStatus) => {
    setBusy(true);
    const { error } = await supabaseBrowser().from('plans').update({ status: next }).eq('id', plan.id);
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success(next === 'done' ? 'Жоспар орындалды деп белгіленді' : `Статус: ${STATUS_VIEW[next].label}`);
    onChanged();
  };
  const remove = async () => {
    setBusy(true);
    const { error } = await supabaseBrowser().from('plans').delete().eq('id', plan.id);
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success('Жоспар өшірілді');
    setConfirmDel(false);
    onChanged();
  };

  return (
    <li data-testid="plan-strip"
      className={clsx('relative flex rounded-2xl bg-white ring-1 transition', done ? 'ring-ok/25' : 'ring-line')}>
      <span className={clsx('w-1 shrink-0 rounded-l-2xl', done ? 'bg-ok' : byCurator ? 'bg-brand-900' : 'bg-brand-300')} aria-hidden />
      <div className={clsx('flex w-[64px] shrink-0 flex-col items-center justify-center border-r border-line px-1 py-3 text-center sm:w-[84px]', done && 'bg-ok-soft/40')}>
        {plan.start_time ? (
          <>
            <span className="text-sm font-extrabold text-ink tabular-nums sm:text-base">{hhmm(plan.start_time)}</span>
            {plan.end_time && <span className="text-[11px] font-semibold text-muted tabular-nums">{hhmm(plan.end_time)}</span>}
          </>
        ) : <Clock className="size-4 text-muted" aria-label="Уақыты белгіленбеген" />}
      </div>
      <div className={clsx('min-w-0 flex-1 rounded-r-2xl p-3 sm:p-4', done && 'bg-ok-soft/20')}>
        <div className="flex items-start gap-2">
          <p className={clsx('min-w-0 flex-1 text-[15px] leading-snug font-bold [overflow-wrap:anywhere]', done ? 'text-muted line-through decoration-ok/60' : 'text-ink')}>{plan.title}</p>
          <span className={clsx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', st.pill)} data-testid="plan-status">{st.icon}{st.label}</span>
        </div>
        {plan.description && <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink/80">{plan.description}</p>}
        {plan.note && (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-mist px-2.5 py-1.5 text-xs text-ink/80"><StickyNote className="mt-0.5 size-3.5 shrink-0 text-brand-700" /> {plan.note}</p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', byCurator ? 'bg-brand-100 text-brand-900' : 'bg-mist text-muted')} data-testid="plan-creator">
            <NotebookPen className="size-3" /> {byCurator ? 'Куратор жасаған' : 'Оқушы жасаған'}
          </span>
          {plan.priority === 'high' && <span className="text-[11px] font-semibold text-brand-700">● {PRIORITY.high.label} маңызды</span>}
          <div className="ml-auto flex items-center gap-1">
            {done ? (
              <Button size="sm" variant="ghost" onClick={() => setStatus('todo')} loading={busy}><RotateCcw className="size-3.5" /> Қайта ашу</Button>
            ) : (
              <Button size="sm" variant="soft" onClick={() => setStatus('done')} loading={busy} data-testid="plan-done"><Check className="size-4" /> Орындалды</Button>
            )}
            <ActionMenu label={`«${plan.title}» әрекеттері`} items={[
              ...(plan.status === 'todo' ? [{ label: 'Орындалуда деп белгілеу', icon: CircleDot, onSelect: () => setStatus('in_progress') }] : []),
              ...(canEdit ? [{ label: 'Жоспарды өзгерту', icon: Pencil, onSelect: onEdit, testId: 'plan-edit' }] : [{ label: 'Толығырақ', icon: Lock, onSelect: onEdit }]),
              ...(canDelete ? [{ label: 'Жоспарды өшіру', icon: Trash2, onSelect: () => setConfirmDel(true), danger: true, testId: 'plan-delete' }] : []),
            ]} />
          </div>
        </div>
      </div>
      <ConfirmModal open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={remove} loading={busy} danger
        title="Жоспарды өшіру" text={<>«<b>{plan.title}</b>» жоспары біржола өшіріледі.</>} confirmLabel="Өшіру" />
    </li>
  );
}

/** Келесі толық сағат (жаңа жоспар үшін әдепкі уақыт) */
function nextSlot(): { start: string; end: string } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Almaty' }));
  const h = Math.min(22, now.getHours() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return { start: `${p(h)}:00`, end: `${p(h)}:30` };
}

function PlanModal({
  plan, date, studentId, mode, onClose, onSaved,
}: { plan: Plan | null; date: string; studentId: string; mode: Mode; onClose: () => void; onSaved: (date?: string) => void }) {
  const toast = useToast();
  const locked = mode === 'student' && plan?.creator_role === 'curator';
  const slot = useMemo(nextSlot, []);
  const [f, setF] = useState({
    title: plan?.title ?? '',
    description: plan?.description ?? '',
    note: plan?.note ?? '',
    plan_date: plan?.plan_date ?? date,
    start_time: plan ? hhmm(plan.start_time) : slot.start,
    end_time: plan ? hhmm(plan.end_time) : slot.end,
    priority: (plan?.priority ?? 'medium') as Priority,
    status: (plan?.status ?? 'todo') as PlanStatus,
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setErr(null); setF((s) => ({ ...s, [k]: v })); };

  const save = async () => {
    if (!locked) {
      if (!f.title.trim()) return setErr('Жоспар атауын енгізіңіз.');
      if (!f.plan_date) return setErr('Күнді таңдаңыз.');
      if (!f.start_time) return setErr('Басталу уақытын белгілеңіз.');
      if (f.end_time && f.end_time <= f.start_time) return setErr('Аяқталу уақыты басталу уақытынан кейін болуы керек.');
    }
    setSaving(true);
    const sb = supabaseBrowser();
    const payload = locked ? { status: f.status } : {
      title: f.title.trim(), description: f.description.trim() || null, note: f.note.trim() || null, plan_date: f.plan_date,
      start_time: f.start_time || null, end_time: f.end_time || null, priority: f.priority, status: f.status,
    };
    const { error } = plan
      ? await sb.from('plans').update(payload).eq('id', plan.id)
      : await sb.from('plans').insert({ ...payload, student_id: studentId, creator_role: mode });
    setSaving(false);
    if (error) return setErr(humanError(error));
    toast.success(plan ? 'Жоспар сақталды' : mode === 'curator' ? 'Жоспар оқушының кабинетіне қосылды' : 'Жоспар қосылды');
    onSaved(locked ? undefined : f.plan_date);
  };

  return (
    <Modal open onClose={onClose}
      title={plan ? (locked ? 'Куратор жоспары' : 'Жоспарды өзгерту') : 'Жаңа жоспар'}
      subtitle={plan ? `${plan.creator_role === 'curator' ? 'Куратор' : 'Оқушы'} жасаған` : dayTitle(f.plan_date)}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Болдырмау</Button>
        <Button onClick={save} loading={saving} data-testid="plan-save">Сақтау</Button>
      </>}>
      {locked && (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-xs text-ink">
          <Lock className="mt-0.5 size-3.5 shrink-0" /> Бұл жоспарды куратор құрған. Сіз тек орындалу статусын белгілей аласыз.
        </p>
      )}
      <div className="space-y-4">
        <Field label="Жоспар атауы" required>
          <Input value={f.title} onChange={(e) => set('title', e.target.value)} disabled={locked} maxLength={200} placeholder="Мысалы: Қазақстан тарихынан оқу" data-testid="plan-title" />
        </Field>
        <Field label="Сипаттамасы">
          <Textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} disabled={locked} maxLength={4000} placeholder="Не істеу керек" />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Күні" required className="col-span-2 sm:col-span-1">
            <Input type="date" value={f.plan_date} onChange={(e) => set('plan_date', e.target.value)} disabled={locked} />
          </Field>
          <Field label="Басталуы" required><Input type="time" value={f.start_time} onChange={(e) => set('start_time', e.target.value)} disabled={locked} data-testid="plan-start" /></Field>
          <Field label="Аяқталуы"><Input type="time" value={f.end_time} onChange={(e) => set('end_time', e.target.value)} disabled={locked} data-testid="plan-end" /></Field>
        </div>
        <Field label="Қосымша ескертпе">
          <Textarea rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} disabled={locked} maxLength={2000} placeholder="Мысалы: қате сұрақтарды дәптерге жаз" data-testid="plan-note" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Маңыздылығы">
            <Select value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)} disabled={locked}>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
            </Select>
          </Field>
          <Field label="Статусы">
            <Select value={f.status} onChange={(e) => set('status', e.target.value as PlanStatus)}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{PLAN_STATUS[s].label}</option>)}
            </Select>
          </Field>
        </div>
        {err && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  );
}
