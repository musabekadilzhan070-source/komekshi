'use client';
import { useAccount } from '@/components/shell/account-context';
import { RequestsBoard } from '@/components/features/requests';
import { PageHeader } from '@/components/ui/misc';

export default function CuratorRequestsPage() {
  const me = useAccount();
  return (
    <>
      <PageHeader title="Тіркелу өтініштері" subtitle="Сізді куратор ретінде таңдаған оқушылардың өтініштері" />
      <RequestsBoard kind="student" curatorId={me.id} />
    </>
  );
}
