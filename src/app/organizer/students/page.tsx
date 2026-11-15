'use client';
import { useState } from 'react';
import { ArrowLeftRight, BarChart3, GraduationCap, Lock, Search, Trash2, Unlock } from 'lucide-react';
import { relativeTime, shortDate } from '@/lib/date';
import { ACCOUNT_STATUS } from '@/lib/labels';
import type { StudentOverview } from '@/lib/types';
import { TransferModal, useAccountActions, useAllCurators, useAllStudents } from '@/components/features/organizer';
import { StudentStatsPanel } from '@/components/features/student-stats';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProgressBar, Tabs } from '@/components/ui/misc';
import { Input, Select } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';

type F = 'active' | 'blocked' | 'pending' | 'nocurator' | 'all';

export default function OrganizerStudentsPage() {
  const { data, error, loading, reload } = useAllStudents();
  const curators = useAllCurators();
  const [f, setF] = useState<F>('active');
  const [q, setQ] = useState('');
  const [cur, setCur] = useState('');
  const [transfer, setTransfer] = useState<StudentOverview | null>(null);
  const [view, setView] = useState<StudentOverview | null>(null);
  const actions = useAccountActions(() => reload(true));

  const all = data ?? [];
  const counts: Record<F, number> = {
    active: all.filter((s) => s.status === 'active').length,
    blocked: all.filter((s) => s.status === 'blocked').length,
    pending: all.filter((s) => s.status === 'pending' || s.status === 'rejected').length,
    nocurator: all.filter((s) => !s.curator_id && s.status !== 'pending').length,
    all: all.length,
  };
  const list = all
    .filter((s) => f === 'all' || (f === 'pending' ? ['pending', 'rejected'].includes(s.status) : f === 'nocurator' ? !s.curator_id && s.status !== 'pending' : s.status === f))
    .filter((s) => !cur || s.curator_id === cur)
    .filter((s) => (s.full_name + ' ' + s.email).toLocaleLowerCase('kk').includes(q.trim().toLocaleLowerCase('kk')));

  return (
    <>
      <PageHeader title="Оқушылар" subtitle={`Платформадағы барлық оқушылар: ${all.length}`} />
      <div className="mb-4 space-y-3">
        <Tabs value={f} onChange={setF} items={[
          { value: 'active', label: 'Белсенді', count: counts.active },
          { value: 'blocked', label: 'Бұғатталған', count: counts.blocked },
          { value: 'pending', label: 'Өтініш кезеңінде', count: counts.pending },
          { value: 'nocurator', label: 'Кураторсыз', count: counts.nocurator },
          { value: 'all', label: 'Барлығы', count: counts.all },
        ]} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Аты немесе пошта" className="pl-11" />
          </div>
          <Select value={cur} onChange={(e) => setCur(e.target.value)} className="sm:w-64">
            <option value="">Барлық кураторлар</option>
            {(curators.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </Select>
        </div>
      </div>
      {loading ? <LoadingBlock rows={5} /> : error ? <ErrorState text={error} onRetry={reload} /> : list.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Оқушы табылмады" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {list.map((s) => (
            <Card key={s.id} className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <Avatar name={s.full_name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{s.full_name}</p>
                  <p className="truncate text-xs text-muted">{s.email}</p>
                </div>
                <Badge tone={ACCOUNT_STATUS[s.status].tone}>{ACCOUNT_STATUS[s.status].label}</Badge>
              </div>
              <div className="mt-3 rounded-2xl bg-mist/60 px-3 py-2 text-xs">
                <span className="text-muted">Куратор: </span><b className="text-ink">{s.curator_name ?? 'тағайындалмаған'}</b>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <ProgressBar value={s.week_progress} className="flex-1" />
                <span className="text-xs font-bold text-ink">{s.week_total ? `${s.week_progress}%` : '—'}</span>
              </div>
              <p className="mt-2 text-[11px] text-muted">Тіркелген: {shortDate(s.created_at)} · Белсенділік: {relativeTime(s.last_active_at)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                <IconBtn label="Статистика" onClick={() => setView(s)}><BarChart3 className="size-4" /></IconBtn>
                {s.status !== 'pending' && <IconBtn label="Кураторды ауыстыру" onClick={() => setTransfer(s)}><ArrowLeftRight className="size-4" /></IconBtn>}
                {s.status === 'active' && <IconBtn label="Бұғаттау" onClick={() => actions.ask({ kind: 'block', id: s.id, name: s.full_name, role: 'student' })}><Lock className="size-4" /></IconBtn>}
                {s.status === 'blocked' && <IconBtn label="Белсендіру" onClick={() => actions.ask({ kind: 'unblock', id: s.id, name: s.full_name, role: 'student' })}><Unlock className="size-4" /></IconBtn>}
                <IconBtn label="Өшіру" danger onClick={() => actions.ask({ kind: 'delete', id: s.id, name: s.full_name, role: 'student' })}><Trash2 className="size-4" /></IconBtn>
              </div>
            </Card>
          ))}
        </div>
      )}
      {transfer && <TransferModal student={transfer} curators={curators.data ?? []} onClose={() => setTransfer(null)} onDone={() => { setTransfer(null); reload(true); }} />}
      {view && <Modal open onClose={() => setView(null)} size="xl" title={view.full_name} subtitle={`Куратор: ${view.curator_name ?? '—'}`}><StudentStatsPanel studentId={view.id} /></Modal>}
      {actions.modal}
    </>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={danger ? 'ml-auto flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-bad hover:bg-bad-soft' : 'flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-ink ring-1 ring-line hover:bg-brand-50'}>
      {children}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}
