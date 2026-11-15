'use client';
import { BarChart3 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad } from '@/lib/hooks';
import type { GroupWeekHistory } from '@/lib/types';
import { useAccount } from '@/components/shell/account-context';
import { useMyStudents } from '@/components/features/students';
import { StudentComparison } from '@/components/features/compare';
import { AreaTrend, Bars, weekTick } from '@/components/features/charts';
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/misc';

export default function CuratorStatsPage() {
  const me = useAccount();
  const { data, error, loading, reload } = useMyStudents(me.id);
  const hist = useLoad(async () => must(await supabaseBrowser().rpc('group_weekly_history', { p_curator: me.id, p_weeks: 8 })) as GroupWeekHistory[], [me.id]);
  return (
    <>
      <PageHeader title="Статистика" subtitle="Әр оқушының жұмысын салыстырып, нәтижесін бақылаңыз" />
      {loading ? <LoadingBlock rows={4} /> : error ? <ErrorState text={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon={BarChart3} title="Статистика үшін оқушы жоқ" />
      ) : (
        <div className="space-y-4">
          {hist.data && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-4 sm:p-5">
                <h3 className="mb-2 text-sm font-bold text-navy-900">Топтың орташа апталық прогресі, %</h3>
                <AreaTrend data={hist.data} x="week_start" y="avg_progress" name="Орташа прогресс" unit="%" max={100} />
              </Card>
              <Card className="p-4 sm:p-5">
                <h3 className="mb-2 text-sm font-bold text-navy-900">Белсенділік динамикасы</h3>
                <Bars data={hist.data} x="week_start" tickFormatter={weekTick}
                  bars={[{ key: 'active_students', name: 'Белсенді оқушылар' }, { key: 'tasks_done', name: 'Тапсырылған тапсырмалар' }, { key: 'qa_completed', name: 'Қаралған видео' }]} />
              </Card>
            </div>
          )}
          <StudentComparison students={data} linkBase="/curator/students" />
        </div>
      )}
    </>
  );
}
