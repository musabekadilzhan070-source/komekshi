'use client';
import { BookOpen, CalendarCheck, CheckCircle2, Clock, ListChecks, PlayCircle } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { minutesLabel } from '@/lib/date';
import type { StudentOverview, WeekHistory } from '@/lib/types';
import { Card, ErrorState, LoadingBlock, ProgressRing, StatCard } from '@/components/ui/misc';
import { AreaTrend, Bars, weekTick } from './charts';

export function useStudentSummary(studentId: string, weeks = 8) {
  const q = useLoad(async () => {
    const sb = supabaseBrowser();
    const [o, h] = await Promise.all([
      sb.from('v_student_overview').select('*').eq('id', studentId).maybeSingle(),
      sb.rpc('student_weekly_history', { p_student: studentId, p_weeks: weeks }),
    ]);
    return { overview: must(o) as StudentOverview | null, history: must(h) as WeekHistory[] };
  }, [studentId, weeks]);
  useRealtime(['tracker_progress', 'task_submissions', 'book_reports', 'plans', 'qa_participation'], () => q.reload(true), `student_id=eq.${studentId}`);
  return q;
}

const ratio = (a: number, b: number) => (b ? Math.round((a * 100) / b) : null);

export function StudentStatsPanel({ studentId }: { studentId: string }) {
  const { data, error, loading, reload } = useStudentSummary(studentId);
  if (loading) return <LoadingBlock rows={4} />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  const o = data!.overview;
  const h = data!.history;
  if (!o) return <ErrorState text="Деректер табылмады." />;
  const hasHistory = h.some((w) => w.tracker_total || w.pages || w.tasks_done || w.plans_total);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="flex flex-col items-center justify-center gap-2 p-6 text-center">
          <ProgressRing value={o.week_progress} size={140} stroke={12} label="апталық трекер" />
          <p className="text-sm text-muted">{o.week_total ? `${o.week_done} / ${o.week_total} орындалды` : 'Бұл аптаға трекер жоқ'}</p>
        </Card>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <StatCard label="Тапсырмалар орындалуы" value={ratio(o.tasks_accepted, o.tasks_total) == null ? '—' : `${ratio(o.tasks_accepted, o.tasks_total)}%`}
            hint={`${o.tasks_accepted} қабылданды · ${o.tasks_open} орындалуда`} icon={CheckCircle2} />
          <StatCard label="Жоспарлардың орындалуы" value={ratio(o.plans_done, o.plans_total) == null ? '—' : `${ratio(o.plans_done, o.plans_total)}%`}
            hint={`${o.plans_done} / ${o.plans_total} жоспар`} icon={CalendarCheck} />
          <StatCard label="Оқылған беттер" value={o.pages_total} hint={`Осы аптада: ${o.week_pages} бет`} icon={BookOpen} />
          <StatCard label="Оқуға жұмсалған уақыт" value={minutesLabel(o.minutes_total)} hint={`${o.books_total} кітап`} icon={Clock} />
          <StatCard label="Сұрақ-жауапқа қатысу" value={`${o.qa_completed} / ${o.qa_assigned}`} hint="аяқталған видеолар" icon={PlayCircle} />
          <StatCard label="Мерзімі өткен тапсырмалар" value={o.tasks_overdue} hint={o.tasks_review ? `${o.tasks_review} тексеруде` : undefined} icon={ListChecks} />
        </div>
      </div>
      {hasHistory ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <h3 className="mb-2 text-sm font-bold text-berry-900">Апталық трекер прогресі, %</h3>
            <AreaTrend data={h} x="week_start" y="progress" name="Прогресс" unit="%" max={100} />
          </Card>
          <Card className="p-4 sm:p-5">
            <h3 className="mb-2 text-sm font-bold text-berry-900">Белсенділік динамикасы</h3>
            <Bars data={h} x="week_start" tickFormatter={weekTick}
              bars={[{ key: 'tasks_done', name: 'Тапсырылған тапсырмалар' }, { key: 'plans_done', name: 'Орындалған жоспарлар' }]} />
          </Card>
          <Card className="p-4 sm:p-5">
            <h3 className="mb-2 text-sm font-bold text-berry-900">Оқылған беттер</h3>
            <Bars data={h} x="week_start" tickFormatter={weekTick} bars={[{ key: 'pages', name: 'Беттер' }]} unit=" бет" />
          </Card>
          <Card className="p-4 sm:p-5">
            <h3 className="mb-2 text-sm font-bold text-berry-900">Оқуға жұмсалған уақыт, мин</h3>
            <Bars data={h} x="week_start" tickFormatter={weekTick} bars={[{ key: 'minutes', name: 'Минут', color: '#8C1C3C' }]} unit=" мин" />
          </Card>
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-muted">Графиктер деректер жиналғанда пайда болады: трекерді толтырыңыз, тапсырма орындаңыз, кітап оқу есебін жіберіңіз.</Card>
      )}
    </div>
  );
}
