'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount } from '@/components/shell/account-context';
import { StudentQa } from '@/components/features/qa';
import { LoadingBlock, PageHeader } from '@/components/ui/misc';

function Inner() {
  const me = useAccount();
  const params = useSearchParams();
  return <StudentQa studentId={me.id} curatorName={me.curator?.full_name} focusId={params.get('id')} />;
}

export default function StudentQaPage() {
  return (
    <>
      <PageHeader title="Апталық сұрақ-жауап" subtitle="Куратордың апталық видеосын қарап шығыңыз. Қатысуыңыз автоматты түрде сақталады." />
      <Suspense fallback={<LoadingBlock />}><Inner /></Suspense>
    </>
  );
}
