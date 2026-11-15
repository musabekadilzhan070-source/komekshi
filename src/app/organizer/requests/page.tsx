'use client';
import { useState } from 'react';
import { RequestsBoard } from '@/components/features/requests';
import { PageHeader, Tabs } from '@/components/ui/misc';

export default function OrganizerRequestsPage() {
  const [kind, setKind] = useState<'curator' | 'student'>('curator');
  return (
    <>
      <PageHeader title="Тіркелу өтініштері" subtitle="Жаңа кураторлардың өтініштері. Қажет болса, оқушы өтініштерін де қарастыра аласыз." />
      <Tabs className="mb-4" value={kind} onChange={setKind} items={[{ value: 'curator', label: 'Куратор өтініштері' }, { value: 'student', label: 'Оқушы өтініштері' }]} />
      <RequestsBoard key={kind} kind={kind} />
    </>
  );
}
