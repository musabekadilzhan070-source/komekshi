'use client';
import { useState } from 'react';
import { Check, Mail, MessageSquare, Phone, UserPlus, X } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { dateTime } from '@/lib/date';
import { REQUEST_STATUS } from '@/lib/labels';
import type { RequestStatus } from '@/lib/types';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingBlock, Tabs } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

interface Req {
  id: string; status: RequestStatus; message: string | null; created_at: string; decided_at: string | null;
  contact_info?: string | null; person: { id: string; full_name: string; email: string; contact_info: string | null } | null;
  curator?: { full_name: string } | null;
}

/** kind=student: куратор (немесе организатор) оқушы өтініштерін қарайды; kind=curator: организатор */
export function RequestsBoard({ kind, curatorId }: { kind: 'student' | 'curator'; curatorId?: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<RequestStatus>('pending');
  const [confirm, setConfirm] = useState<{ req: Req; approve: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const table = kind === 'student' ? 'student_requests' : 'curator_requests';

  const { data, error, loading, reload } = useLoad(async () => {
    const sb = supabaseBrowser();
    let q = kind === 'student'
      ? sb.from('student_requests').select('*, person:profiles!student_requests_student_id_fkey(id, full_name, email, contact_info), curator:profiles!student_requests_curator_id_fkey(full_name)')
      : sb.from('curator_requests').select('*, person:profiles!curator_requests_curator_id_fkey(id, full_name, email, contact_info)');
    if (curatorId) q = q.eq('curator_id', curatorId);
    return must(await q.order('created_at', { ascending: false })) as Req[];
  }, [kind, curatorId]);
  useRealtime([table], () => reload(true));

  const decide = async () => {
    if (!confirm) return;
    setBusy(true);
    const fn = kind === 'student' ? 'decide_student_request' : 'decide_curator_request';
    const { error } = await supabaseBrowser().rpc(fn, { p_request: confirm.req.id, p_approve: confirm.approve });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success(confirm.approve
      ? (kind === 'student' ? 'Оқушы тобыңызға қабылданды' : 'Куратор белсендірілді және тізімге қосылды')
      : 'Өтініш қабылданбады');
    setConfirm(null);
    reload(true);
  };

  const counts = { pending: 0, approved: 0, rejected: 0 } as Record<RequestStatus, number>;
  data?.forEach((r) => counts[r.status]++);
  const list = (data ?? []).filter((r) => r.status === tab);

  return (
    <>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[
        { value: 'pending', label: 'Жаңа', count: counts.pending },
        { value: 'approved', label: 'Қабылданған', count: counts.approved },
        { value: 'rejected', label: 'Қабылданбаған', count: counts.rejected },
      ]} />
      {loading ? <LoadingBlock /> : error ? <ErrorState text={error} onRetry={reload} /> : list.length === 0 ? (
        <EmptyState icon={UserPlus} title={tab === 'pending' ? 'Жаңа өтініш жоқ' : 'Өтініш жоқ'} text={tab === 'pending' ? 'Жаңа өтініш түскенде хабарлама келеді.' : undefined} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((r) => (
            <Card key={r.id} className="flex flex-col p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Avatar name={r.person?.full_name ?? '?'} size={46} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">{r.person?.full_name ?? 'Өшірілген аккаунт'}</p>
                  {kind === 'curator' && r.person?.email && <p className="flex items-center gap-1.5 truncate text-xs text-muted"><Mail className="size-3" /> {r.person.email}</p>}
                  <p className="mt-0.5 text-[11px] text-muted">Жіберілді: {dateTime(r.created_at)}</p>
                </div>
                <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
              </div>
              {kind === 'curator' && (r.contact_info || r.person?.contact_info) && (
                <p className="mt-3 flex items-center gap-2 rounded-2xl bg-mist/60 px-3 py-2 text-sm"><Phone className="size-4 text-brand-700" /> {r.contact_info || r.person?.contact_info}</p>
              )}
              {!curatorId && kind === 'student' && r.curator && <p className="mt-2 text-xs text-muted">Таңдаған куратор: <b className="text-ink">{r.curator.full_name}</b></p>}
              {r.message && <p className="mt-3 flex gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-sm"><MessageSquare className="mt-0.5 size-4 shrink-0 text-brand-700" /> {r.message}</p>}
              {r.decided_at && <p className="mt-2 text-[11px] text-muted">Шешім: {dateTime(r.decided_at)}</p>}
              {r.status === 'pending' && (
                <div className="mt-4 flex gap-2">
                  <Button variant="danger" className="flex-1" onClick={() => setConfirm({ req: r, approve: false })}><X className="size-4" /> Қабылдамау</Button>
                  <Button className="flex-1" onClick={() => setConfirm({ req: r, approve: true })}><Check className="size-4" /> Қабылдау</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={decide}
        loading={busy}
        danger={confirm ? !confirm.approve : false}
        title={confirm?.approve ? 'Өтінішті қабылдау' : 'Өтінішті қабылдамау'}
        confirmLabel={confirm?.approve ? 'Қабылдау' : 'Қабылдамау'}
        text={confirm?.approve
          ? (kind === 'student'
              ? <><b>{confirm.req.person?.full_name}</b> тобыңызға қосылады және жеке кабинетіне кіре алады.</>
              : <><b>{confirm?.req.person?.full_name}</b> белсенді куратор болады және оқушылар тіркелу кезінде оны таңдай алады.</>)
          : <><b>{confirm?.req.person?.full_name}</b> өтініші қабылданбайды. Ол қайта өтініш жібере алады.</>}
      />
    </>
  );
}
