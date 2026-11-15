'use client';
import { useState } from 'react';
import { Lock, Phone, Search, Trash2, Unlock, Users } from 'lucide-react';
import { relativeTime, shortDate } from '@/lib/date';
import { ACCOUNT_STATUS } from '@/lib/labels';
import type { CuratorOverview } from '@/lib/types';
import { useAccountActions, useAllCurators, useAllStudents } from '@/components/features/organizer';
import { StudentComparison } from '@/components/features/compare';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Tabs } from '@/components/ui/misc';
import { Input } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';

export default function OrganizerCuratorsPage() {
  const { data, error, loading, reload } = useAllCurators();
  const students = useAllStudents();
  const [f, setF] = useState<'active' | 'blocked' | 'all'>('active');
  const [q, setQ] = useState('');
  const [view, setView] = useState<CuratorOverview | null>(null);
  const actions = useAccountActions(() => { reload(true); students.reload(true); });
  const all = (data ?? []).filter((c) => c.status === 'active' || c.status === 'blocked');
  const list = all.filter((c) => f === 'all' || c.status === f)
    .filter((c) => (c.full_name + ' ' + c.email).toLocaleLowerCase('kk').includes(q.trim().toLocaleLowerCase('kk')));

  return (
    <>
      <PageHeader title="Кураторлар" subtitle={`Белсенді: ${all.filter((c) => c.status === 'active').length} · Барлығы: ${all.length}`} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={f} onChange={setF} items={[
          { value: 'active', label: 'Белсенді', count: all.filter((c) => c.status === 'active').length },
          { value: 'blocked', label: 'Бұғатталған', count: all.filter((c) => c.status === 'blocked').length },
          { value: 'all', label: 'Барлығы', count: all.length },
        ]} />
        <div className="relative lg:ml-auto lg:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Куратор іздеу" className="pl-11" />
        </div>
      </div>
      {loading ? <LoadingBlock rows={4} /> : error ? <ErrorState text={error} onRetry={reload} /> : list.length === 0 ? (
        <EmptyState icon={Users} title="Куратор табылмады" text="Жаңа кураторлар өтініші «Тіркелу өтініштері» бөлімінде." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {list.map((c) => (
            <Card key={c.id} className="flex flex-col p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Avatar name={c.full_name} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-berry-900">{c.full_name}</p>
                  <p className="truncate text-xs text-muted">{c.email}</p>
                  {c.contact_info && <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted"><Phone className="size-3" /> {c.contact_info}</p>}
                </div>
                <Badge tone={ACCOUNT_STATUS[c.status].tone}>{ACCOUNT_STATUS[c.status].label}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Mini v={c.students_active} l="оқушы" />
                <Mini v={c.avg_week_progress == null ? '—' : `${c.avg_week_progress}%`} l="орт. прогресс" />
                <Mini v={c.actions_7d} l="әрекет / 7 күн" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <Badge>{c.tasks_created} тапсырма</Badge>
                <Badge>{c.trackers_created} трекер</Badge>
                <Badge>{c.videos_uploaded} видео</Badge>
                {c.requests_pending > 0 && <Badge tone="warn">{c.requests_pending} өтініш күтуде</Badge>}
                {c.reports_pending > 0 && <Badge tone="berry">{c.reports_pending} есеп тексерілмеген</Badge>}
              </div>
              <p className="mt-3 text-[11px] text-muted">Мақұлданған: {shortDate(c.approved_at)} · Соңғы белсенділік: {relativeTime(c.last_active_at)}</p>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                <Button size="sm" variant="soft" onClick={() => setView(c)}>Оқушылары</Button>
                {c.status === 'active'
                  ? <Button size="sm" variant="secondary" onClick={() => actions.ask({ kind: 'block', id: c.id, name: c.full_name, role: 'curator' })}><Lock className="size-3.5" /> Бұғаттау</Button>
                  : <Button size="sm" variant="secondary" onClick={() => actions.ask({ kind: 'unblock', id: c.id, name: c.full_name, role: 'curator' })}><Unlock className="size-3.5" /> Белсендіру</Button>}
                <Button size="sm" variant="danger" className="ml-auto" onClick={() => actions.ask({ kind: 'delete', id: c.id, name: c.full_name, role: 'curator' })} aria-label="Өшіру"><Trash2 className="size-3.5" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {view && (
        <Modal open onClose={() => setView(null)} size="xl" title={view.full_name} subtitle="Куратордың оқушылары және олардың нәтижелері">
          {(() => {
            const st = (students.data ?? []).filter((s) => s.curator_id === view.id && s.status === 'active');
            return st.length ? <StudentComparison students={st} /> : <EmptyState icon={Users} title="Белсенді оқушы жоқ" />;
          })()}
        </Modal>
      )}
      {actions.modal}
    </>
  );
}

function Mini({ v, l }: { v: React.ReactNode; l: string }) {
  return <div className="rounded-2xl bg-mist/60 py-2"><p className="text-lg font-extrabold text-berry-900">{v}</p><p className="text-[10px] text-muted">{l}</p></div>;
}
