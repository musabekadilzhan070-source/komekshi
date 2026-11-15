'use client';
import { Suspense, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAccount } from '@/components/shell/account-context';
import { useMyStudents } from '@/components/features/students';
import { CreateTaskModal, CuratorTaskCatalog, SubmissionList } from '@/components/features/tasks';
import { LoadingBlock, PageHeader, Tabs } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export default function CuratorTasksPage() {
  const me = useAccount();
  const { data, names } = useMyStudents(me.id);
  const [view, setView] = useState<'progress' | 'catalog'>('progress');
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <PageHeader
        title="Тапсырмалар"
        subtitle="Оқушыларға жеке тапсырма беріңіз, орындалғанын тексеріп, қабылдаңыз немесе қайта жіберіңіз."
        action={<Button onClick={() => setOpen(true)} disabled={!data?.length}><Plus className="size-4" /> Жаңа тапсырма</Button>}
      />
      <Tabs className="mb-4" value={view} onChange={setView} items={[{ value: 'progress', label: 'Оқушылар бойынша' }, { value: 'catalog', label: 'Мен берген тапсырмалар' }]} />
      <Suspense fallback={<LoadingBlock />}>
        {view === 'progress'
          ? <SubmissionList key={key} mode="curator" names={names} defaultFilter="review" />
          : <CuratorTaskCatalog key={key} curatorId={me.id} names={names} />}
      </Suspense>
      {open && <CreateTaskModal students={data ?? []} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); setKey((k) => k + 1); }} />}
    </>
  );
}
