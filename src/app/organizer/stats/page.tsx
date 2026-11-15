'use client';
import { BookOpen, CheckCircle2, Clock, GraduationCap, PlayCircle, TrendingUp, Users } from 'lucide-react';
import { minutesLabel } from '@/lib/date';
import { usePlatformStats } from '@/components/features/platform-stats';
import { useAllCurators, useAllStudents } from '@/components/features/organizer';
import { AreaTrend, Bars, weekTick } from '@/components/features/charts';
import { Card, ErrorState, LoadingBlock, PageHeader, StatCard, EmptyState } from '@/components/ui/misc';

const r = (a: number, b: number) => (b ? `${Math.round((a * 100) / b)}%` : '—');

export default function OrganizerStatsPage() {
  const { data, error, loading, reload } = usePlatformStats();
  const curators = useAllCurators();
  const students = useAllStudents();
  const s = data?.stats;
  const perCurator = (curators.data ?? []).filter((c) => c.status === 'active').map((c) => {
    const st = (students.data ?? []).filter((x) => x.curator_id === c.id && x.status === 'active');
    return {
      name: c.full_name, students: c.students_active, progress: c.avg_week_progress ?? 0,
      pages: st.reduce((a, x) => a + x.pages_total, 0),
      tasks: st.reduce((a, x) => a + x.tasks_accepted, 0),
    };
  });
  return (
    <>
      <PageHeader title="Жалпы статистика" subtitle="Бүкіл платформа бойынша нақты көрсеткіштер" />
      {loading ? <LoadingBlock rows={4} /> : error ? <ErrorState text={error} onRetry={reload} /> : s && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard tone="dark" label="Оқушылардың жалпы саны" value={s.students_total} icon={GraduationCap} />
            <StatCard label="Кураторлардың жалпы саны" value={s.curators_total} icon={Users} />
            <StatCard label="Орташа апталық прогресс" value={s.avg_week_progress == null ? '—' : `${s.avg_week_progress}%`} icon={TrendingUp} />
            <StatCard label="Тапсырмалардың орындалуы" value={r(s.tasks_accepted, s.tasks_total)} icon={CheckCircle2} hint={`${s.tasks_accepted} / ${s.tasks_total} қабылданды`} />
            <StatCard label="Оқылған беттер" value={s.pages_total} icon={BookOpen} hint={`${s.reports_total} есеп`} />
            <StatCard label="Оқуға жұмсалған уақыт" value={minutesLabel(s.minutes_total)} icon={Clock} />
            <StatCard label="Сұрақ-жауапқа қатысу" value={r(s.qa_completed, s.qa_assigned)} icon={PlayCircle} hint={`${s.qa_completed} / ${s.qa_assigned} видео қаралды`} />
            <StatCard tone="accent" label="Тексеруді күтетін тапсырмалар" value={s.tasks_review} icon={CheckCircle2} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="p-4 sm:p-5">
              <h3 className="mb-2 text-sm font-bold text-ink">Орташа апталық прогресс, %</h3>
              <AreaTrend data={data!.history} x="week_start" y="avg_progress" name="Прогресс" unit="%" max={100} />
            </Card>
            <Card className="p-4 sm:p-5">
              <h3 className="mb-2 text-sm font-bold text-ink">Кітап оқу статистикасы (апта бойынша)</h3>
              <Bars data={data!.history} x="week_start" tickFormatter={weekTick} bars={[{ key: 'pages', name: 'Беттер' }, { key: 'minutes', name: 'Минут' }]} />
            </Card>
            <Card className="p-4 sm:p-5">
              <h3 className="mb-2 text-sm font-bold text-ink">Тапсырма және сұрақ-жауап белсенділігі</h3>
              <Bars data={data!.history} x="week_start" tickFormatter={weekTick} bars={[{ key: 'tasks_done', name: 'Тапсырылған тапсырмалар' }, { key: 'qa_completed', name: 'Қаралған видео' }]} />
            </Card>
            <Card className="p-4 sm:p-5">
              <h3 className="mb-2 text-sm font-bold text-ink">Әр кураторға тіркелген оқушылар</h3>
              {perCurator.length ? <Bars data={perCurator} x="name" layout="vertical" height={Math.max(200, perCurator.length * 40 + 40)} bars={[{ key: 'students', name: 'Оқушылар' }]} />
                : <EmptyState icon={Users} title="Белсенді куратор жоқ" />}
            </Card>
          </div>
          {perCurator.length > 0 && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="border-b border-line bg-white/60 text-left text-[11px] tracking-wide text-muted uppercase">
                    <th className="px-4 py-3">Куратор</th><th className="px-3 py-3">Оқушылар</th><th className="px-3 py-3">Орт. прогресс</th><th className="px-3 py-3">Қабылданған тапсырмалар</th><th className="px-3 py-3">Оқылған беттер</th>
                  </tr></thead>
                  <tbody>
                    {perCurator.map((c) => (
                      <tr key={c.name} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-3 font-semibold text-ink">{c.name}</td>
                        <td className="px-3 py-3">{c.students}</td>
                        <td className="px-3 py-3 font-bold">{c.progress}%</td>
                        <td className="px-3 py-3">{c.tasks}</td>
                        <td className="px-3 py-3">{c.pages}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
