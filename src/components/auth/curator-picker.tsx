'use client';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, Search, UserRound } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { humanError } from '@/lib/errors';
import { Input } from '@/components/ui/form';
import { Avatar, EmptyState, Spinner } from '@/components/ui/misc';

interface CuratorOption { id: string; full_name: string; bio: string | null; student_count: number }

export function CuratorPicker({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const [list, setList] = useState<CuratorOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabaseBrowser().rpc('list_active_curators').then(({ data, error }) => {
      if (error) setError(humanError(error));
      else setList(data as CuratorOption[]);
    });
  }, []);
  const filtered = useMemo(
    () => (list ?? []).filter((c) => c.full_name.toLocaleLowerCase('kk').includes(q.trim().toLocaleLowerCase('kk'))),
    [list, q],
  );
  if (error) return <p className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>;
  if (!list) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (list.length === 0)
    return <EmptyState icon={UserRound} title="Белсенді куратор әзірге жоқ" text="Кураторлар тіркеліп, ұйымдастырушы мақұлдағаннан кейін осында шығады." />;
  return (
    <div>
      {list.length > 4 && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Куратор іздеу" className="pl-11" />
        </div>
      )}
      <div className="max-h-[46dvh] space-y-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Кураторлар">
        {filtered.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={selected === c.id}
            onClick={() => onSelect(c.id)}
            className={clsx(
              'flex w-full items-center gap-3 rounded-3xl border-2 p-3 text-left transition-all',
              selected === c.id ? 'border-brand-700 bg-brand-50' : 'border-line bg-white hover:border-brand-300',
            )}
          >
            <Avatar name={c.full_name} size={44} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-ink">{c.full_name}</span>
              <span className="block text-xs text-muted">{c.student_count} оқушы{c.bio ? ` · ${c.bio}` : ''}</span>
            </span>
            <span className={clsx('flex size-6 shrink-0 items-center justify-center rounded-full border-2', selected === c.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-200')}>
              {selected === c.id && <Check className="size-3.5" />}
            </span>
          </button>
        ))}
        {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted">Ештеңе табылмады</p>}
      </div>
    </div>
  );
}

