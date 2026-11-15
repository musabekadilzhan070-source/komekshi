'use client';
import Link from 'next/link';
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardList, TrendingUp, UserCheck, UserPlus, Users, XCircle } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { longDate, relativeTime, todayISO } from '@/lib/date';
import type { GroupWeekHistory } from '@/lib/types';
import { useAccount } from '@/components/shell/account-context';
import { useMyStudents } from '@/components/features/students';
import { AreaTrend } from '@/components/features/charts';
import { Avatar, Badge, Card, EmptyState, LoadingBlock, ProgressBar, SectionTitle, StatCard } from '@/components/ui/misc';

const DONE_THRESHOLD = 80;

export default function CuratorHome() {
  const me = useAccount();
  const { data: students, loading } = useMyStudents(me.id, true);
  const extra = useLoad(async () => {
    const sb = supabaseBrowser();
    const [req, rep, rev, hist] = await Promise.all([
      sb.from('student_requests').select('id', { count: 'exact', head: true }).eq('curator_id', me.id).eq('status', 'pending'),
      sb.from('book_reports').select('id', { count: 'exact', head: true }).eq('curator_id', me.id).eq('status', 'submitted'),
      sb.from('task_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      sb.rpc('group_weekly_history', { p_curator: me.id, p_weeks: 8 }),
    ]);
    return { requests: req.count ?? 0, reports: rep.count ?? 0, reviews: rev.count ?? 0, history: must(hist) as GroupWeekHistory[] };
  }, [me.id]);
  useRealtime(['student_requests', 'book_reports', 'task_submissions'], () => extra.reload(true));

  const active = (students ?? []).filter((s) => s.status === 'active');
  const recentlyActive = active.filter((s) => s.last_active_at && Date.now() - new Date(s.last_active_at).getTime() < 7 * 86400e3);
  const withTracker = active.filter((s) => s.week_total > 0);
  const done = withTracker.filter((s) => (s.week_progress ?? 0) >= DONE_THRESHOLD);
  const notDone = withTracker.filter((s) => (s.week_progress ?? 0) < DONE_THRESHOLD);
  const avg = withTracker.length ? Math.round(withTracker.reduce((a, s) => a + (s.week_progress ?? 0), 0) / withTracker.length) : null;
  const attention = [...active]
    .map((s) => ({ s, score: (s.tasks_overdue * 3) + (s.week_total ? (100 - (s.week_progress ?? 0)) / 20 : 0) + (s.last_active_at ? 0 : 2) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  const e = extra.data;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] bg-berry-900 p-5 text-white sm:p-7">
        <div className="pointer-events-none absolute -top-20 -right-10 size-72 rounded-full bg-berry-700/55" />
        <div className="relative">
          <p className="text-sm text-berry-200">{longDate(todayISO())}</p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Қайырлы күн, {me.full_name.split(' ')[0]}!</h1>
          <p className="mt-2 max-w-xl text-sm text-white/75">
            {e && (e.requests + e.reviews + e.reports) > 0
              ? `Сізді ${e.requests} жаңа өтініш, ${e.reviews} тапсырма және ${e.reports} есеп күтіп тұр.`
              : 'Бүгін шұғыл тексеретін ештеңе жоқ. Оқушыларыңыздың прогресін бақылаңыз.'}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" label="Жалпы оқушылар" value={loading ? '…' : students?.length ?? 0} icon={Users} hint={`${active.length} белсенді аккаунт`} />
        <StatCard label="Белсенді оқушылар" value={loading ? '…' : recentlyActive.length} icon={UserCheck} hint="соңғы 7 күнде кірген" />
        <StatCard label="Апталық тапсырманы орындағандар" value={loading ? '…' : done.length} icon={CheckCircle2} hint={`трекердің ${DONE_THRESHOLD}%+ орындаған`} />
        <StatCard label="Орындамағандар" value={loading ? '…' : notDone.length} icon={XCircle} hint={`${DONE_THRESHOLD}%-дан төмен`} />
        <Link href="/curator/requests"><StatCard label="Жаңа өтініштер" value={e?.requests ?? '…'} icon={UserPlus} className="h-full" /></Link>
        <Link href="/curator/reports"><StatCard label="Тексеруді күтетін есептер" value={e?.reports ?? '…'} icon={BookOpen} className="h-full" /></Link>
        <Link href="/curator/tasks"><StatCard label="Тексеруді күтетін тапсырмалар" value={e?.reviews ?? '…'} icon={ClipboardList} className="h-full" /></Link>
        <StatCard tone="accent" label="Апталық орташа прогресс" value={avg == null ? '—' : `${avg}%`} icon={TrendingUp} hint={`${withTracker.length} оқушы бойынша`} />
      </div>

      <div className="grid gap-5 2xl:grid-cols-[1.3fr_1fr]">
        <Card className="p-4 sm:p-6">
          <SectionTitle title="Топтың апталық прогресі" subtitle="Оқушылардың орташа трекер прогресі, %" action={<Link href="/curator/stats" className="text-sm font-semibold text-berry-700 hover:underline">Статистика</Link>} />
          {extra.loading ? <LoadingBlock rows={2} /> : e?.history.some((h) => h.avg_progress != null)
            ? <AreaTrend data={e.history} x="week_start" y="avg_progress" name="Орташа прогресс" unit="%" max={100} />
            : <EmptyState icon={TrendingUp} title="Әзірге деректер жоқ" text="Трекер тағайындалып, оқушылар толтыра бастағанда график пайда болады." />}
        </Card>
        <Card className="p-4 sm:p-6">
          <SectionTitle title="Назар аударыңыз" subtitle="Прогресі төмен немесе мерзімі өткен тапсырмасы бар" />
          {loading ? <LoadingBlock rows={3} /> : attention.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Барлығы жақсы" text="Мерзімі өткен тапсырма мен төмен прогресс жоқ." />
          ) : (
            <ul className="space-y-2">
              {attention.map(({ s }) => (
                <li key={s.id}>
                  <Link href={`/curator/students/${s.id}`} className="flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-berry-50">
                    <Avatar name={s.full_name} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-berry-900">{s.full_name}</p>
                      <div className="mt-1 flex items-center gap-2"><ProgressBar value={s.week_progress} className="max-w-32" /><span className="text-[11px] text-muted">{s.week_total ? `${s.week_progress}%` : 'трекер жоқ'}</span></div>
                    </div>
                    {s.tasks_overdue > 0 ? <Badge tone="bad"><AlertTriangle className="size-3" /> {s.tasks_overdue}</Badge> : <span className="text-[11px] text-muted">{relativeTime(s.last_active_at)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
