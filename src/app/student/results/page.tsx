'use client';
import { useAccount } from '@/components/shell/account-context';
import { StudentStatsPanel } from '@/components/features/student-stats';
import { PageHeader } from '@/components/ui/misc';

export default function StudentResultsPage() {
  const me = useAccount();
  return (
    <>
      <PageHeader title="Нәтижелерім" subtitle="Соңғы 8 аптадағы оқу көрсеткіштеріңіз" />
      <StudentStatsPanel studentId={me.id} />
    </>
  );
}
