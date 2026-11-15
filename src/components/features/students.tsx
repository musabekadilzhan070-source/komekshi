'use client';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, Search } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import type { StudentOverview } from '@/lib/types';
import { Avatar } from '@/components/ui/misc';
import { Input } from '@/components/ui/form';

/** Куратордың белсенді оқушылары (RLS: тек өз тобы) */
export function useMyStudents(curatorId: string, includeInactive = false) {
  const q = useLoad(async () => {
    let req = supabaseBrowser().from('v_student_overview').select('*').eq('curator_id', curatorId).order('full_name');
    if (!includeInactive) req = req.eq('status', 'active');
    return must(await req) as StudentOverview[];
  }, [curatorId, includeInactive]);
  useRealtime(['tracker_progress', 'task_submissions', 'book_reports', 'plans', 'qa_participation'], () => q.reload(true));
  const names = useMemo(() => new Map((q.data ?? []).map((s) => [s.id, s.full_name])), [q.data]);
  return { ...q, names };
}

export function StudentMultiSelect({
  students, value, onChange, disabledIds = [],
}: { students: { id: string; full_name: string }[]; value: string[]; onChange: (ids: string[]) => void; disabledIds?: string[] }) {
  const [q, setQ] = useState('');
  const list = students.filter((s) => s.full_name.toLocaleLowerCase('kk').includes(q.trim().toLocaleLowerCase('kk')));
  const selectable = students.filter((s) => !disabledIds.includes(s.id));
  const all = selectable.length > 0 && selectable.every((s) => value.includes(s.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  if (students.length === 0) return <p className="rounded-2xl bg-mist px-4 py-3 text-sm text-muted">Тобыңызда белсенді оқушы жоқ.</p>;
  return (
    <div className="rounded-3xl border border-line bg-white p-2">
      <div className="flex items-center gap-2 p-1">
        {students.length > 6 && (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Іздеу" className="!py-2 pl-9" />
          </div>
        )}
        <button
          type="button"
          onClick={() => onChange(all ? [] : selectable.map((s) => s.id))}
          className="ml-auto shrink-0 rounded-full bg-berry-100 px-3 py-1.5 text-xs font-semibold text-berry-900 hover:bg-berry-200"
        >
          {all ? 'Барлығын алып тастау' : 'Барлығын таңдау'}
        </button>
      </div>
      <div className="mt-1 grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
        {list.map((s) => {
          const on = value.includes(s.id);
          const dis = disabledIds.includes(s.id);
          return (
            <button
              type="button"
              key={s.id}
              disabled={dis}
              onClick={() => toggle(s.id)}
              className={clsx('flex items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left text-sm transition-colors', on ? 'bg-berry-50' : 'hover:bg-mist/60', dis && 'opacity-50')}
            >
              <span className={clsx('flex size-5 shrink-0 items-center justify-center rounded-md border-2', on || dis ? 'border-berry-700 bg-berry-700 text-white' : 'border-berry-300')}>
                {(on || dis) && <Check className="size-3" />}
              </span>
              <Avatar name={s.full_name} size={28} />
              <span className="min-w-0 flex-1 truncate font-medium">{s.full_name}</span>
              {dis && <span className="text-[10px] text-muted">тағайындалған</span>}
            </button>
          );
        })}
      </div>
      <p className="px-2 pt-2 pb-1 text-xs text-muted">Таңдалды: <b className="text-berry-900">{value.length}</b></p>
    </div>
  );
}
