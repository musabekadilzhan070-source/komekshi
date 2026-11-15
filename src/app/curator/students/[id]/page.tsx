'use client';
import { Suspense, use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ListChecks, Mail, Plus } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad } from '@/lib/hooks';
import { relativeTime, shortDate } from '@/lib/date';
import type { StudentOverview } from '@/lib/types';
import { useAccount } from '@/components/shell/account-context';
import { Planner } from '@/components/features/planner';
import { CreateTaskModal, SubmissionList } from '@/components/features/tasks';
import { TrackerPicker, TrackerSheet, useStudentTrackers } from '@/components/features/tracker';
import { ReadingStatCards, ReportList, useReports } from '@/components/features/reading';
import { StudentQaParticipation } from '@/components/features/qa';
import { StudentStatsPanel } from '@/components/features/student-stats';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingBlock, ProgressRing, Tabs } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

type Tab = 'plan' | 'tasks' | 'tracker' | 'reading' | 'qa' | 'stats';

export default function CuratorStudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useAccount();
  const [tab, setTab] = useState<Tab>('plan');
  const [taskOpen, setTaskOpen] = useState(false);
  const { data: s, error, loading, reload } = useLoad(async () => {
    return must(await supabaseBrowser().from('v_student_overview').select('*').eq('id', id).eq('curator_id', me.id).maybeSingle()) as StudentOverview | null;
  }, [id]);

  if (loading) return <LoadingBlock rows={4} />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!s) return <EmptyState title="Оқушы табылмады" text="Бұл оқушы сіздің тобыңызда емес." action={<Link href="/curator/students" className="font-bold text-navy-700">Оқушылар тізіміне</Link>} />;

  return (
    <div className="space-y-5">
      <Link href="/curator/students" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-navy-900"><ArrowLeft className="size-4" /> Менің оқушыларым</Link>
      <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <Avatar name={s.full_name} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-navy-900">{s.full_name}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted"><Mail className="size-3.5" /> {s.email}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge>Тіркелген: {shortDate(s.joined_at ?? s.created_at)}</Badge>
            <Badge tone="info">Белсенділік: {relativeTime(s.last_active_at)}</Badge>
            <Badge tone={s.tasks_open ? 'warn' : 'ok'}>{s.tasks_open} орындалмаған тапсырма</Badge>
            {s.status !== 'active' && <Badge tone="bad">Бұғатталған</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ProgressRing value={s.week_progress} size={92} stroke={9} label="апта" />
          <Button onClick={() => setTaskOpen(true)}><Plus className="size-4" /> Тапсырма</Button>
        </div>
      </Card>

      <Tabs value={tab} onChange={setTab} items={[
        { value: 'plan', label: 'Жоспарлары' },
        { value: 'tasks', label: 'Тапсырмалары', count: s.tasks_total },
        { value: 'tracker', label: 'Апталық трекерлері' },
        { value: 'reading', label: 'Кітап есептері', count: s.reports_pending || undefined },
        { value: 'qa', label: 'Сұрақ-жауап' },
        { value: 'stats', label: 'Статистика' },
      ]} />

      <Suspense fallback={<LoadingBlock />}>
        {tab === 'plan' && <Planner studentId={s.id} mode="curator" />}
        {tab === 'tasks' && <SubmissionList studentId={s.id} mode="curator" names={new Map([[s.id, s.full_name]])} defaultFilter="all" />}
        {tab === 'tracker' && <StudentTrackers studentId={s.id} />}
        {tab === 'reading' && <StudentReading studentId={s.id} name={s.full_name} />}
        {tab === 'qa' && <StudentQaParticipation studentId={s.id} />}
        {tab === 'stats' && <StudentStatsPanel studentId={s.id} />}
      </Suspense>
      {taskOpen && <CreateTaskModal students={[{ id: s.id, full_name: s.full_name }]} preselected={[s.id]} onClose={() => setTaskOpen(false)} onCreated={() => { setTaskOpen(false); setTab('tasks'); reload(true); }} />}
    </div>
  );
}

function StudentTrackers({ studentId }: { studentId: string }) {
  const { data, error, loading, reload } = useStudentTrackers(studentId);
  const [sel, setSel] = useState<string | null>(null);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data!.trackers.length) return <EmptyState icon={ListChecks} title="Трекер тағайындалмаған" action={<Link href="/curator/tracker" className="text-sm font-bold text-navy-700">Трекер құру →</Link>} />;
  const t = data!.trackers.find((x) => x.id === sel) ?? data!.trackers[0];
  return (
    <div className="space-y-4">
      <TrackerPicker trackers={data!.trackers} progress={data!.progress} value={t.id} onChange={setSel} />
      <TrackerSheet tracker={t} progress={data!.progress} studentId={studentId} readOnly />
    </div>
  );
}

function StudentReading({ studentId, name }: { studentId: string; name: string }) {
  const { data, error, loading, reload } = useReports(studentId);
  return (
    <div className="space-y-4">
      {data && <ReadingStatCards reports={data} />}
      <ReportList reports={data} loading={loading} error={error} reload={() => reload(true)} mode="curator" names={new Map([[studentId, name]])} />
    </div>
  );
}
