'use client';
import { Suspense } from 'react';
import { useAccount } from '@/components/shell/account-context';
import { useMyStudents } from '@/components/features/students';
import { ReadingStatCards, ReportList, useReports } from '@/components/features/reading';
import { LoadingBlock, PageHeader } from '@/components/ui/misc';

function Inner() {
  const me = useAccount();
  const { names } = useMyStudents(me.id, true);
  const { data, error, loading, reload } = useReports();
  return (
    <div className="space-y-5">
      {data && <ReadingStatCards reports={data} />}
      <ReportList reports={data} loading={loading} error={error} reload={() => reload(true)} mode="curator" names={names} />
    </div>
  );
}

export default function CuratorReportsPage() {
  return (
    <>
      <PageHeader title="Кітап оқу есептері" subtitle="Оқушылардың жіберген есептерін тексеріп, пікір қалдырыңыз." />
      <Suspense fallback={<LoadingBlock />}><Inner /></Suspense>
    </>
  );
}
