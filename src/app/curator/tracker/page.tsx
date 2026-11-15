'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { ListChecks, Plus } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad } from '@/lib/hooks';
import { todayISO, weekRange } from '@/lib/date';
import { useAccount } from '@/components/shell/account-context';
import { useMyStudents } from '@/components/features/students';
import { CuratorTrackerDetail, TrackerBuilderModal, type TrackerWithItems } from '@/components/features/tracker';
import { Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

type Row = TrackerWithItems & { tracker_assignments: { student_id: string }[] };

function Inner() {
  const me = useAccount();
  const router = useRouter();
  const params = useSearchParams();
  const { data: students } = useMyStudents(me.id);
  const [builder, setBuilder] = useState<null | { copy: TrackerWithItems | null }>(null);
  const [sel, setSel] = useState<string | null>(params.get('id'));
  const { data, error, loading, reload } = useLoad(async () => {
    const res = await supabaseBrowser().from('weekly_trackers').select('*, weekly_tracker_items(*), tracker_assignments(student_id)')
      .eq('curator_id', me.id).order('week_start', { ascending: false }).order('created_at', { ascending: false });
    const rows = must(res) as Row[];
    rows.forEach((t) => t.weekly_tracker_items.sort((a, b) => a.sort_order - b.sort_order));
    return rows;
  }, [me.id]);

  useEffect(() => {
    if (data && (!sel || !data.some((t) => t.id === sel))) setSel(data[0]?.id ?? null);
  }, [data, sel]);

  const today = todayISO();
  const current = data?.find((t) => t.id === sel);
  return (
    <>
      <PageHeader
        title="Апталық трекер"
        subtitle="Трекерді нөлден құрастырып, бір немесе бірнеше оқушыға тағайындаңыз. Толтыру барысы тікелей жаңарады."
        action={<Button onClick={() => setBuilder({ copy: null })}><Plus className="size-4" /> Жаңа трекер</Button>}
      />
      {loading ? <LoadingBlock rows={4} /> : error ? <ErrorState text={error} onRetry={reload} /> : !data!.length ? (
        <EmptyState icon={ListChecks} title="Әлі трекер құрылмаған" text="Апталық тақырыптар, тапсырмалар және сабақтар тізімін құрастырыңыз."
          action={<Button size="sm" variant="soft" onClick={() => setBuilder({ copy: null })}><Plus className="size-4" /> Трекер құру</Button>} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
          <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:flex-col xl:overflow-visible xl:px-0">
            {data!.map((t) => {
              const isCurrent = today >= t.week_start && today <= t.week_end;
              return (
                <button key={t.id} onClick={() => setSel(t.id)}
                  className={clsx('w-[230px] shrink-0 rounded-3xl p-4 text-left transition-all xl:w-auto', t.id === sel ? 'bg-brand-900 text-white shadow-lift' : 'bg-cream shadow-soft hover:shadow-lift')}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={clsx('text-[11px] font-semibold', t.id === sel ? 'text-white/75' : 'text-brand-700')}>{weekRange(t.week_start)}</p>
                    {isCurrent && <Badge tone={t.id === sel ? 'soft' : 'ok'}>Ағымдағы</Badge>}
                  </div>
                  <p className="mt-1 truncate font-bold">{t.title}</p>
                  <p className={clsx('mt-1 text-xs', t.id === sel ? 'text-white/70' : 'text-muted')}>{t.weekly_tracker_items.length} элемент · {t.tracker_assignments.length} оқушы</p>
                </button>
              );
            })}
          </div>
          {current && (
            <CuratorTrackerDetail key={current.id} tracker={current} students={students ?? []}
              onDeleted={() => { setSel(null); reload(true); }} onCopy={() => setBuilder({ copy: current })} />
          )}
        </div>
      )}
      {builder && (
        <TrackerBuilderModal students={students ?? []} copyFrom={builder.copy} onClose={() => setBuilder(null)}
          onCreated={(id) => { setBuilder(null); setSel(id); router.replace(`/curator/tracker?id=${id}`); reload(true); }} />
      )}
    </>
  );
}

export default function CuratorTrackerPage() {
  return <Suspense fallback={<LoadingBlock />}><Inner /></Suspense>;
}
