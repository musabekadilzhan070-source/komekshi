'use client';
import { Suspense, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAccount } from '@/components/shell/account-context';
import { ReadingStatCards, ReportFormModal, ReportList, useReports } from '@/components/features/reading';
import { LoadingBlock, PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

function Inner() {
  const me = useAccount();
  const { data, error, loading, reload } = useReports(me.id);
  const [form, setForm] = useState(false);
  return (
    <>
      <PageHeader
        title="Кітап оқу есебі"
        subtitle="Оқыған кітабыңыз бойынша есеп беріңіз. Статистика автоматты түрде есептеледі."
        action={<Button onClick={() => setForm(true)}><Plus className="size-4" /> Есеп беру</Button>}
      />
      <div className="space-y-5">
        {data && <ReadingStatCards reports={data} />}
        <ReportList reports={data} loading={loading} error={error} reload={() => reload(true)} mode="student" studentId={me.id} />
      </div>
      {form && <ReportFormModal studentId={me.id} onClose={() => setForm(false)} onSaved={() => { setForm(false); reload(true); }} />}
    </>
  );
}

export default function StudentReadingPage() {
  return <Suspense fallback={<LoadingBlock />}><Inner /></Suspense>;
}
