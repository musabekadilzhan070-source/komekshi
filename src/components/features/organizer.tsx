'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import type { AccountStatus, CuratorOverview, StudentOverview } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ConfirmModal, Modal } from '@/components/ui/modal';
import { Field, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

export function useAllStudents() {
  const q = useLoad(async () => must(await supabaseBrowser().from('v_student_overview').select('*').order('full_name')) as StudentOverview[], []);
  useRealtime(['student_requests', 'tracker_progress', 'task_submissions'], () => q.reload(true));
  return q;
}

export function useAllCurators() {
  const q = useLoad(async () => must(await supabaseBrowser().from('v_curator_overview').select('*').order('full_name')) as CuratorOverview[], []);
  useRealtime(['curator_requests', 'student_requests'], () => q.reload(true));
  return q;
}

/** Бұғаттау / белсендіру / өшіру әрекеттері */
export function useAccountActions(onDone: () => void) {
  const toast = useToast();
  const [pending, setPending] = useState<{ kind: 'block' | 'unblock' | 'delete'; id: string; name: string; role: 'student' | 'curator' } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    const sb = supabaseBrowser();
    const { error } = pending.kind === 'delete'
      ? await sb.rpc('delete_account', { p_user: pending.id })
      : await sb.rpc('set_account_status', { p_user: pending.id, p_status: (pending.kind === 'block' ? 'blocked' : 'active') as AccountStatus });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success(pending.kind === 'delete' ? 'Аккаунт өшірілді' : pending.kind === 'block' ? 'Аккаунт уақытша бұғатталды' : 'Аккаунт белсендірілді');
    setPending(null);
    onDone();
  };

  const modal = (
    <ConfirmModal
      open={!!pending}
      onClose={() => setPending(null)}
      onConfirm={run}
      loading={busy}
      danger={pending?.kind !== 'unblock'}
      title={pending?.kind === 'delete' ? 'Аккаунтты өшіру' : pending?.kind === 'block' ? 'Уақытша бұғаттау' : 'Бұғаттан шығару'}
      confirmLabel={pending?.kind === 'delete' ? 'Біржола өшіру' : pending?.kind === 'block' ? 'Бұғаттау' : 'Белсендіру'}
      text={
        pending?.kind === 'delete' ? (
          <><b>{pending.name}</b> аккаунты және оған қатысты барлық деректер біржола өшіріледі. Бұл әрекетті қайтару мүмкін емес.
            {pending.role === 'curator' && <> Куратордың оқушылары кураторсыз қалады — оларды басқа кураторға ауыстырыңыз.</>}</>
        ) : pending?.kind === 'block' ? (
          <><b>{pending.name}</b> платформаға кіре алмайды. Деректері сақталады, кез келген уақытта қайта белсендіруге болады.</>
        ) : <><b>{pending?.name}</b> қайтадан платформаны пайдалана алады.</>
      }
    />
  );
  return { ask: setPending, modal };
}

export function TransferModal({
  student, curators, onClose, onDone,
}: { student: StudentOverview; curators: CuratorOverview[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const options = curators.filter((c) => c.status === 'active' && c.id !== student.curator_id);
  const [cid, setCid] = useState(options[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await supabaseBrowser().rpc('transfer_student', { p_student: student.id, p_curator: cid });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success('Оқушы жаңа кураторға ауыстырылды');
    onDone();
  };
  return (
    <Modal open onClose={onClose} title="Кураторды ауыстыру" subtitle={student.full_name} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Бас тарту</Button><Button onClick={save} loading={busy} disabled={!cid}>Ауыстыру</Button></>}>
      <p className="mb-4 text-sm text-muted">Қазіргі куратор: <b className="text-ink">{student.curator_name ?? 'жоқ'}</b></p>
      {options.length === 0 ? <p className="rounded-2xl bg-mist px-4 py-3 text-sm text-muted">Басқа белсенді куратор жоқ.</p> : (
        <Field label="Жаңа куратор">
          <Select value={cid} onChange={(e) => setCid(e.target.value)}>
            {options.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.students_active} оқушы)</option>)}
          </Select>
        </Field>
      )}
      <p className="mt-3 text-xs text-muted">Оқушының барлық деректері (жоспар, тапсырма, трекер, есептер) сақталады және жаңа куратордың кабинетінде көрінеді.</p>
    </Modal>
  );
}
