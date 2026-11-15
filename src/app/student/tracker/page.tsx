'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { useAccount } from '@/components/shell/account-context';
import { TrackerPicker, TrackerSheet, useStudentTrackers } from '@/components/features/tracker';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/misc';
import { todayISO } from '@/lib/date';

function Inner() {
  const me = useAccount();
  const params = useSearchParams();
  const { data, error, loading, reload } = useStudentTrackers(me.id);
  const [sel, setSel] = useState<string | null>(params.get('id'));

  useEffect(() => {
    if (!data || (sel && data.trackers.some((t) => t.id === sel))) return;
    const t = todayISO();
    const current = data.trackers.find((x) => t >= x.week_start && t <= x.week_end) ?? data.trackers[0];
    setSel(current?.id ?? null);
  }, [data, sel]);

  if (loading) return <LoadingBlock rows={4} />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data!.trackers.length) return <EmptyState icon={ListChecks} title="Апталық трекер әлі жарияланбаған" text="Куратор трекер жасап, сізге тағайындағанда осында пайда болады." />;
  const tracker = data!.trackers.find((t) => t.id === sel);
  return (
    <div className="space-y-4">
      <TrackerPicker trackers={data!.trackers} progress={data!.progress} value={sel} onChange={setSel} />
      {tracker && <TrackerSheet tracker={tracker} progress={data!.progress} studentId={me.id} onChanged={() => reload(true)} />}
    </div>
  );
}

export default function StudentTrackerPage() {
  return (
    <>
      <PageHeader title="Апталық трекер" subtitle="Апта бойы орындалған тақырыптар, тапсырмалар мен сабақтарды белгілеңіз. Прогресс автоматты есептеледі." />
      <Suspense fallback={<LoadingBlock />}><Inner /></Suspense>
    </>
  );
}
