'use client';
import { Suspense } from 'react';
import { useAccount } from '@/components/shell/account-context';
import { SubmissionList } from '@/components/features/tasks';
import { LoadingBlock, PageHeader } from '@/components/ui/misc';

export default function StudentTasksPage() {
  const me = useAccount();
  return (
    <>
      <PageHeader title="Тапсырмалар" subtitle="Куратор берген жеке тапсырмалар. Орындағаннан кейін «Орындалды» батырмасын басыңыз." />
      <Suspense fallback={<LoadingBlock />}><SubmissionList studentId={me.id} mode="student" /></Suspense>
    </>
  );
}
