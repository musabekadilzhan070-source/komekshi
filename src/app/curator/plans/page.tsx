'use client';
import { Suspense, useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useAccount } from '@/components/shell/account-context';
import { useMyStudents } from '@/components/features/students';
import { Planner } from '@/components/features/planner';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/misc';
import { Field, Select } from '@/components/ui/form';

export default function CuratorPlansPage() {
  const me = useAccount();
  const { data, error, loading, reload } = useMyStudents(me.id);
  const [sid, setSid] = useState<string>('');
  useEffect(() => { if (data?.length && !sid) setSid(data[0].id); }, [data, sid]);
  return (
    <>
      <PageHeader title="Жоспарлар" subtitle="Оқушыны таңдап, оның күнтізбесіне тікелей жоспар құрыңыз. Жоспар оқушы кабинетінде бірден пайда болады." />
      {loading ? <LoadingBlock /> : error ? <ErrorState text={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon={CalendarDays} title="Тобыңызда белсенді оқушы жоқ" />
      ) : (
        <>
          <Field label="Оқушы" className="mb-4 max-w-sm">
            <Select value={sid} onChange={(e) => setSid(e.target.value)}>
              {data.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Select>
          </Field>
          {sid && <Suspense fallback={<LoadingBlock />}><Planner key={sid} studentId={sid} mode="curator" /></Suspense>}
        </>
      )}
    </>
  );
}
