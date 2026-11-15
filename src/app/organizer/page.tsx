'use client';
import Link from 'next/link';
import { Activity, GraduationCap, ShieldCheck, TrendingUp, UserPlus, Users } from 'lucide-react';
import { longDate, todayISO } from '@/lib/date';
import { useAccount } from '@/components/shell/account-context';
import { usePlatformStats } from '@/components/features/platform-stats';
import { useAllCurators } from '@/components/features/organizer';
import { AreaTrend, Bars, weekTick } from '@/components/features/charts';
import { Card, EmptyState, ErrorState, LoadingBlock, SectionTitle, StatCard } from '@/components/ui/misc';
import { LinkButton } from '@/components/ui/button';
import { Ornament } from '@/components/ui/ornament';

export default function OrganizerHome() {
  const me = useAccount();
  const { data, error, loading, reload } = usePlatformStats();
  const curators = useAllCurators();
  const s = data?.stats;
  const perCurator = (curators.data ?? []).filter((c) => c.status === 'active').map((c) => ({ name: c.full_name, students: c.students_active, progress: c.avg_week_progress ?? 0 }));

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] bg-navy-900 p-5 text-white sm:p-7">
        <Ornament kind="koshkar" className="absolute -top-10 -right-10 size-60 text-mist/[0.07] sm:size-72" strokeWidth={1.4} />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-mist/70">{longDate(todayISO())}</p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Басқару панелі</h1>
            <p className="mt-1 text-sm text-white/75">{me.full_name} · Организатор</p>
          </div>
          {s && s.curator_requests_pending > 0 && (
            <LinkButton href="/organizer/requests" variant="secondary"><UserPlus className="size-4" /> {s.curator_requests_pending} жаңа куратор өтініші</LinkButton>
          )}
        </div>
      </section>

      {loading ? <LoadingBlock rows={3} /> : error ? <ErrorState text={error} onRetry={reload} /> : s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard tone="dark" label="Жалпы оқушылар" value={s.students_total} icon={GraduationCap} hint={`${s.students_active} белсенді`} />
            <StatCard label="Жалпы кураторлар" value={s.curators_total} icon={Users} hint={`${s.curators_active} белсенді`} />
            <StatCard label="Белсенді аккаунттар" value={s.accounts_active} icon={ShieldCheck} hint={`${s.accounts_blocked} бұғатталған`} />
            <Link href="/organizer/requests"><StatCard label="Күтіп тұрған куратор өтініштері" value={s.curator_requests_pending} icon={UserPlus} className="h-full" hint={`${s.student_requests_pending} оқушы өтініші`} /></Link>
            <StatCard label="Белсенді оқушылар (7 күн)" value={s.active_last_7d} icon={Activity} hint={s.students_active ? `${Math.round((s.active_last_7d * 100) / s.students_active)}% белсенді аккаунттан` : undefined} />
            <StatCard tone="accent" label="Жалпы апталық прогресс" value={s.avg_week_progress == null ? '—' : `${s.avg_week_progress}%`} icon={TrendingUp} hint="орташа, трекері барлар" />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="p-4 sm:p-6">
              <SectionTitle title="Апталық прогресс динамикасы" subtitle="Барлық белсенді оқушылар бойынша орташа, %" />
              {data!.history.some((h) => h.avg_progress != null)
                ? <AreaTrend data={data!.history} x="week_start" y="avg_progress" name="Орташа прогресс" unit="%" max={100} />
                : <EmptyState icon={TrendingUp} title="Әзірге деректер жоқ" />}
            </Card>
            <Card className="p-4 sm:p-6">
              <SectionTitle title="Белсенді оқушылар статистикасы" subtitle="Апта сайын платформада әрекет жасаған оқушылар" />
              {data!.history.some((h) => h.active_students > 0)
                ? <Bars data={data!.history} x="week_start" tickFormatter={weekTick} bars={[{ key: 'active_students', name: 'Белсенді оқушылар' }]} />
                : <EmptyState icon={Activity} title="Әзірге деректер жоқ" />}
            </Card>
          </div>
          <Card className="p-4 sm:p-6">
            <SectionTitle title="Кураторлар бойынша" subtitle="Оқушылар саны және орташа апталық прогресс" action={<Link href="/organizer/curators" className="text-sm font-semibold text-navy-700 hover:underline">Кураторлар</Link>} />
            {perCurator.length ? (
              <Bars data={perCurator} x="name" layout="vertical" height={Math.max(200, perCurator.length * 44 + 40)}
                bars={[{ key: 'students', name: 'Оқушылар' }, { key: 'progress', name: 'Орт. прогресс, %' }]} />
            ) : <EmptyState icon={Users} title="Белсенді куратор жоқ" />}
          </Card>
        </>
      )}
    </div>
  );
}
