'use client';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowRight, BookOpen, CalendarDays, ClipboardList, Clock, ListChecks, PlayCircle } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { addDays, hhmm, longDate, shortDate, todayISO, weekdayIndex, WEEKDAYS_SHORT, parseISO } from '@/lib/date';
import { PLAN_STATUS, PRIORITY, SUBMISSION_STATUS } from '@/lib/labels';
import type { Plan, Submission } from '@/lib/types';
import { useAccount } from '@/components/shell/account-context';
import { useStudentSummary } from '@/components/features/student-stats';
import { Badge, Card, EmptyState, LoadingBlock, ProgressBar, ProgressRing, SectionTitle } from '@/components/ui/misc';
import { Ornament } from '@/components/ui/ornament';

export default function StudentHome() {
  const me = useAccount();
  const today = todayISO();
  const weekEnd = addDays(today, 6);
  const summary = useStudentSummary(me.id, 4);
  const { data, loading, reload } = useLoad(async () => {
    const sb = supabaseBrowser();
    const [plans, subs, qa] = await Promise.all([
      sb.from('plans').select('*').eq('student_id', me.id).gte('plan_date', today).lte('plan_date', weekEnd).order('plan_date').order('start_time', { nullsFirst: false }),
      sb.from('task_submissions').select('*, tasks(*)').eq('student_id', me.id).order('assigned_at', { ascending: false }),
      sb.from('qa_video_assignments').select('video_id, qa_videos(id,title,week_label,week_start)').eq('student_id', me.id),
    ]);
    return { plans: must(plans) as Plan[], subs: must(subs) as Submission[], qa: (must(qa) as unknown as { qa_videos: { id: string; title: string; week_label: string; week_start: string } }[]).map((x) => x.qa_videos) };
  }, [me.id, today]);
  useRealtime(['plans', 'task_submissions', 'qa_video_assignments'], () => reload(true), `student_id=eq.${me.id}`);

  const o = summary.data?.overview;
  const todayPlans = data?.plans.filter((p) => p.plan_date === today) ?? [];
  const openSubs = (data?.subs ?? []).filter((s) => ['new', 'in_progress', 'needs_revision'].includes(s.status));
  const dueToday = openSubs.filter((s) => s.tasks && s.tasks.due_date <= today);
  const recent = (data?.subs ?? []).slice(0, 4);
  const latestQa = [...(data?.qa ?? [])].filter(Boolean).sort((a, b) => b.week_start.localeCompare(a.week_start))[0];
  const firstName = me.full_name.split(' ')[0];

  return (
    <div className="space-y-5">
      {/* Сәлемдесу карточкасы */}
      <section className="relative overflow-hidden rounded-[28px] bg-brand-900 p-5 text-white sm:p-7">
        <Ornament kind="koshkar" className="absolute top-5 right-5 size-10 text-white/20 sm:hidden" strokeWidth={1.3} />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-white/70">{longDate(today)}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Сәлем, {firstName}!</h1>
            <p className="mt-1 text-sm text-white/75">{me.full_name}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm">
              <span className="text-white/60">Куратор:</span>
              <span className="font-bold">{me.curator?.full_name ?? '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-3xl bg-white/10 p-4">
            <ProgressRing value={o?.week_progress ?? null} light size={96} stroke={9} />
            <div>
              <p className="text-xs text-white/60">Апталық трекер</p>
              <p className="text-lg font-extrabold">{o?.week_total ? `${o.week_done} / ${o.week_total}` : 'Трекер жоқ'}</p>
              <Link href="/student/tracker" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-white/75 hover:text-white">Трекерді ашу <ArrowRight className="size-3" /></Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[1.25fr_1fr]">
        {/* Бүгін */}
        <Card className="p-4 sm:p-6">
          <SectionTitle title="Бүгін орындалуы керек" subtitle={`${todayPlans.length} жоспар · ${dueToday.length} тапсырма`}
            action={<Link href={`/student/plan?date=${today}`} className="text-sm font-semibold text-brand-700 hover:underline">Күнтізбе</Link>} />
          {loading ? <LoadingBlock rows={3} /> : todayPlans.length + dueToday.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Бүгінге жоспар мен мерзімі жеткен тапсырма жоқ" text="Күніңізді жоспарлап алыңыз." action={<Link href={`/student/plan?date=${today}`} className="text-sm font-bold text-brand-700">Жоспар құру →</Link>} />
          ) : (
            <ul className="space-y-2">
              {dueToday.map((s) => (
                <li key={s.id}>
                  <Link href={`/student/tasks?id=${s.id}`} className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3 transition-colors hover:bg-brand-100">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-900 text-white"><ClipboardList className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{s.tasks?.title}</p>
                      <p className={clsx('text-xs', s.tasks!.due_date < today ? 'font-semibold text-bad' : 'text-muted')}>
                        {s.tasks!.due_date < today ? `Мерзімі өтті: ${shortDate(s.tasks!.due_date)}` : 'Мерзімі — бүгін'}
                      </p>
                    </div>
                    <Badge tone={SUBMISSION_STATUS[s.status].tone}>{SUBMISSION_STATUS[s.status].label}</Badge>
                  </Link>
                </li>
              ))}
              {todayPlans.map((p) => (
                <li key={p.id}>
                  <Link href={`/student/plan?date=${today}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line transition-colors hover:ring-brand-300">
                    <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl', p.creator_role === 'curator' ? 'bg-brand-700 text-white' : 'bg-brand-100 text-brand-700')}><CalendarDays className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className={clsx('truncate text-sm font-bold text-ink', p.status === 'done' && 'text-muted line-through')}>{p.title}</p>
                      <p className="text-xs text-muted">{p.start_time ? `${hhmm(p.start_time)}${p.end_time ? '–' + hhmm(p.end_time) : ''} · ` : ''}{p.creator_role === 'curator' ? 'Куратор жасаған' : 'Өзім жасаған'}</p>
                    </div>
                    <Badge tone={PLAN_STATUS[p.status].tone}>{PLAN_STATUS[p.status].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Апталық прогресс */}
        <Card className="p-4 sm:p-6">
          <SectionTitle title="Апталық прогресс" subtitle="Соңғы 4 апта" action={<Link href="/student/results" className="text-sm font-semibold text-brand-700 hover:underline">Нәтижелерім</Link>} />
          {summary.loading ? <LoadingBlock rows={2} /> : (
            <div className="space-y-4">
              {summary.data?.history.slice().reverse().map((w, i) => (
                <div key={w.week_start}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="font-semibold text-ink">{i === 0 ? 'Осы апта' : `${shortDate(w.week_start)} аптасы`}</span>
                    <span className="text-muted">{w.tracker_total ? `${w.tracker_done}/${w.tracker_total} · ${w.progress}%` : 'трекер жоқ'}</span>
                  </div>
                  <ProgressBar value={w.progress} />
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <MiniStat label="Тапсырма орындалды" value={o ? `${o.tasks_accepted}/${o.tasks_total}` : '—'} />
                <MiniStat label="Оқылған бет" value={o?.pages_total ?? '—'} />
                <MiniStat label="Сұрақ-жауап" value={o ? `${o.qa_completed}/${o.qa_assigned}` : '—'} />
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Оқу жоспары: алдағы 7 күн */}
        <Card className="p-4 sm:p-6">
          <SectionTitle title="Оқу жоспары" subtitle="Алдағы 7 күн" action={<Link href="/student/plan" className="text-sm font-semibold text-brand-700 hover:underline">Барлығы</Link>} />
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => {
              const n = data?.plans.filter((p) => p.plan_date === d) ?? [];
              const done = n.filter((p) => p.status === 'done').length;
              return (
                <Link key={d} href={`/student/plan?date=${d}`} className={clsx('flex flex-col items-center rounded-2xl py-2.5 transition-colors', d === today ? 'bg-brand-900 text-white' : 'bg-white ring-1 ring-line hover:ring-brand-300')}>
                  <span className={clsx('text-[10px] font-bold uppercase', d === today ? 'text-white/75' : 'text-muted')}>{WEEKDAYS_SHORT[weekdayIndex(d)]}</span>
                  <span className="text-lg font-extrabold">{parseISO(d).getDate()}</span>
                  <span className={clsx('mt-0.5 text-[10px] font-semibold', d === today ? 'text-white/80' : 'text-brand-700')}>{n.length ? `${done}/${n.length}` : '·'}</span>
                </Link>
              );
            })}
          </div>
        </Card>

        {/* Соңғы тапсырмалар */}
        <Card className="p-4 sm:p-6">
          <SectionTitle title="Соңғы тапсырмалар" action={<Link href="/student/tasks" className="text-sm font-semibold text-brand-700 hover:underline">Барлығы</Link>} />
          {loading ? <LoadingBlock rows={2} /> : recent.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Тапсырма әлі берілмеген" />
          ) : (
            <ul className="space-y-2">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link href={`/student/tasks?id=${s.id}`} className="flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-brand-50">
                    <span className={clsx('size-2.5 shrink-0 rounded-full', s.tasks?.priority === 'high' ? 'bg-brand-700' : s.tasks?.priority === 'medium' ? 'bg-brand-300' : 'bg-mist-dark')} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{s.tasks?.title}</p>
                      <p className="text-[11px] text-muted">Мерзімі: {shortDate(s.tasks?.due_date)} · {PRIORITY[s.tasks!.priority].label}</p>
                    </div>
                    <Badge tone={SUBMISSION_STATUS[s.status].tone}>{SUBMISSION_STATUS[s.status].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLink href="/student/tracker" icon={ListChecks} title="Апталық трекер" text={o?.week_total ? `${o.week_progress}% орындалды` : 'Тағайындалмаған'} />
        <QuickLink href="/student/reading" icon={BookOpen} title="Кітап оқу есебі" text={o ? `Осы аптада ${o.week_pages} бет` : '—'} />
        <QuickLink href={latestQa ? `/student/qa?id=${latestQa.id}` : '/student/qa'} icon={PlayCircle} title="Апталық сұрақ-жауап" text={latestQa ? latestQa.week_label : 'Видео жоқ'} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-mist/60 p-3 text-center">
      <p className="text-base font-extrabold text-ink">{value}</p>
      <p className="text-[10px] leading-tight text-muted">{label}</p>
    </div>
  );
}

function QuickLink({ href, icon: Icon, title, text }: { href: string; icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <Link href={href} className="card group flex items-center gap-4 p-4 transition-shadow hover:shadow-lift">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 transition-colors group-hover:bg-brand-900 group-hover:text-white"><Icon className="size-6" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="truncate text-xs text-muted">{text}</p>
      </div>
      <Clock className="hidden" />
      <ArrowRight className="size-4 text-brand-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700" />
    </Link>
  );
}
