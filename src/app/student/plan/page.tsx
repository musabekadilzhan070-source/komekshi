'use client';
import { Suspense } from 'react';
import { useAccount } from '@/components/shell/account-context';
import { Planner } from '@/components/features/planner';
import { PageHeader, LoadingBlock } from '@/components/ui/misc';

export default function StudentPlanPage() {
  const me = useAccount();
  return (
    <>
      <PageHeader title="Менің жоспарым" subtitle="Күнді таңдап, сол күнге жоспар құрыңыз. Куратор қосқан жоспарлар да осында көрінеді." />
      <Suspense fallback={<LoadingBlock />}><Planner studentId={me.id} mode="student" /></Suspense>
    </>
  );
}
