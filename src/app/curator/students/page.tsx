'use client';
import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useAccount } from '@/components/shell/account-context';
import { useMyStudents } from '@/components/features/students';
import { StudentCard } from '@/components/features/student-card';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Tabs } from '@/components/ui/misc';
import { Input } from '@/components/ui/form';
import { LinkButton } from '@/components/ui/button';

type Sort = 'name' | 'progress' | 'open' | 'activity';

export default function CuratorStudentsPage() {
  const me = useAccount();
  const { data, error, loading, reload } = useMyStudents(me.id, true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const list = (data ?? [])
    .filter((s) => s.full_name.toLocaleLowerCase('kk').includes(q.trim().toLocaleLowerCase('kk')))
    .sort((a, b) => sort === 'name' ? a.full_name.localeCompare(b.full_name, 'kk')
      : sort === 'progress' ? (a.week_progress ?? -1) - (b.week_progress ?? -1)
      : sort === 'open' ? b.tasks_open - a.tasks_open
      : (a.last_active_at ?? '').localeCompare(b.last_active_at ?? ''));
  return (
    <>
      <PageHeader title="Менің оқушыларым" subtitle={data ? `Тобыңызда ${data.length} оқушы` : undefined} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Оқушы іздеу" className="pl-11" />
        </div>
        <Tabs value={sort} onChange={setSort} items={[
          { value: 'name', label: 'Аты бойынша' },
          { value: 'progress', label: 'Прогресі төмен' },
          { value: 'open', label: 'Қарызы көп' },
          { value: 'activity', label: 'Белсенділігі аз' },
        ]} />
      </div>
      {loading ? <LoadingBlock rows={4} /> : error ? <ErrorState text={error} onRetry={reload} /> : list.length === 0 ? (
        <EmptyState icon={Users} title={q ? 'Ештеңе табылмады' : 'Тобыңызда әлі оқушы жоқ'}
          text={q ? undefined : 'Оқушылар тіркелу кезінде сізді таңдап, өтініш жібереді. Өтінішті қабылдағаннан кейін олар осында көрінеді.'}
          action={!q && <LinkButton href="/curator/requests" variant="soft" size="sm">Өтініштерді қарау</LinkButton>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {list.map((s) => <StudentCard key={s.id} s={s} href={`/curator/students/${s.id}`} />)}
        </div>
      )}
    </>
  );
}
