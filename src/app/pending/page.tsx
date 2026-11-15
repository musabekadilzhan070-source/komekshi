'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ArrowRight, Ban, CheckCircle2, Clock3, LogOut, RotateCcw, Send, XCircle } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { humanError } from '@/lib/errors';
import { dateTime } from '@/lib/date';
import { ROLE_LABEL } from '@/lib/labels';
import type { Account } from '@/lib/types';
import { AuthAside, AuthFrame } from '@/components/auth/auth-frame';
import { CuratorPicker } from '@/components/auth/curator-picker';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Spinner } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';

export default function PendingPage() {
  const router = useRouter();
  const toast = useToast();
  const [acc, setAcc] = useState<Account | null | undefined>(undefined);
  const [curator, setCurator] = useState<string | null>(null);
  const [contact, setContact] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().rpc('my_account');
    setAcc((data as Account) ?? null);
    if (data?.contact_info) setContact((c) => c || data.contact_info);
  }, []);

  useEffect(() => {
    load();
    const sb = supabaseBrowser();
    const ch = sb.channel('my-request')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_requests' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'curator_requests' }, () => load())
      .subscribe();
    const t = setInterval(load, 20000);
    return () => { sb.removeChannel(ch); clearInterval(t); };
  }, [load]);

  const logout = async () => {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const resubmit = async () => {
    if (!acc) return;
    setBusy(true);
    const sb = supabaseBrowser();
    const { error } = acc.role === 'student'
      ? await sb.rpc('resubmit_student_request', { p_curator: curator, p_message: msg || null })
      : await sb.rpc('resubmit_curator_request', { p_contact: contact, p_message: msg || null });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success('Өтініш қайта жіберілді');
    setMsg('');
    load();
  };

  if (acc === undefined) {
    return <AuthFrame><div className="flex justify-center"><Spinner /></div></AuthFrame>;
  }
  if (acc === null) {
    return (
      <AuthFrame>
        <h1 className="text-2xl font-extrabold text-berry-900">Профиль табылмады</h1>
        <p className="mt-2 text-sm text-muted">Бұл аккаунтқа платформа профилі тағайындалмаған. Ұйымдастырушыға хабарласыңыз.</p>
        <Button className="mt-6" variant="secondary" onClick={logout}><LogOut className="size-4" /> Шығу</Button>
      </AuthFrame>
    );
  }

  const status = acc.status;
  const reqStatus = acc.request?.status;
  const steps = [
    { label: 'Өтініш жіберілді', done: true, at: acc.request?.created_at },
    { label: 'Қарастырылуда', done: status !== 'pending', active: status === 'pending' },
    {
      label: status === 'rejected' ? 'Қабылданбады' : 'Қабылданды',
      done: status === 'active' || status === 'rejected',
      bad: status === 'rejected',
      at: acc.request?.decided_at,
    },
  ];
  const reviewer = acc.role === 'student' ? (acc.request?.curator_name ?? 'куратор') : 'ұйымдастырушы';

  return (
    <AuthFrame aside={<AuthAside title="Өтінішіңіздің күйі" text="Өтініш мақұлданған сәтте бұл бет автоматты түрде жаңарады." />}>
      <p className="text-xs font-semibold tracking-wide text-berry-700 uppercase">{ROLE_LABEL[acc.role]} · {acc.full_name}</p>

      {status === 'blocked' ? (
        <>
          <div className="mt-4 mb-4 flex size-14 items-center justify-center rounded-3xl bg-mist text-muted"><Ban className="size-7" /></div>
          <h1 className="text-2xl font-extrabold text-berry-900">Аккаунт уақытша бұғатталған</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">Толығырақ ақпарат алу үшін ұйымдастырушыға немесе кураторыңызға хабарласыңыз.</p>
        </>
      ) : (
        <>
          <h1 className="mt-2 text-2xl font-extrabold text-berry-900">
            {status === 'pending' && 'Өтінішіңіз қарастырылуда'}
            {status === 'rejected' && 'Өтінішіңіз қабылданбады'}
            {status === 'active' && 'Өтінішіңіз қабылданды!'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {status === 'pending' && <>Өтінішіңізді <b className="text-ink">{reviewer}</b> қарастырады. Мақұлданғанша жеке кабинетке кіру мүмкін емес.</>}
            {status === 'rejected' && (acc.role === 'student' ? 'Басқа куратор таңдап, өтінішті қайта жібере аласыз.' : 'Деректеріңізді нақтылап, өтінішті қайта жібере аласыз.')}
            {status === 'active' && 'Енді жеке кабинетіңізге кіре аласыз.'}
          </p>

          <ol className="mt-6 space-y-0">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={clsx(
                    'flex size-8 items-center justify-center rounded-full',
                    s.bad ? 'bg-bad-soft text-bad' : s.done ? 'bg-berry-700 text-white' : s.active ? 'bg-warn-soft text-warn' : 'bg-mist text-muted',
                  )}>
                    {s.bad ? <XCircle className="size-4" /> : s.done ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}
                  </span>
                  {i < steps.length - 1 && <span className={clsx('my-1 w-0.5 flex-1 rounded', s.done ? 'bg-berry-300' : 'bg-line')} style={{ minHeight: 20 }} />}
                </div>
                <div className="pb-4">
                  <p className={clsx('text-sm font-bold', s.bad ? 'text-bad' : 'text-berry-900')}>{s.label}</p>
                  {s.at && <p className="text-xs text-muted">{dateTime(s.at)}</p>}
                  {s.active && <p className="text-xs text-warn">Күтуде…</p>}
                </div>
              </li>
            ))}
          </ol>

          {status === 'active' && (
            <Button size="lg" className="mt-2 w-full" onClick={() => { router.replace('/' + acc.role); router.refresh(); }}>
              Кабинетке өту <ArrowRight className="size-4" />
            </Button>
          )}

          {status === 'rejected' && reqStatus === 'rejected' && (
            <div className="mt-2 space-y-4 rounded-3xl bg-white p-4 ring-1 ring-line">
              <p className="flex items-center gap-2 text-sm font-bold text-berry-900"><RotateCcw className="size-4" /> Қайта өтініш жіберу</p>
              {acc.role === 'student' ? (
                <CuratorPicker selected={curator} onSelect={setCurator} />
              ) : (
                <Field label="Байланыс ақпараты" required><Input value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
              )}
              <Field label="Хабарлама" hint="Міндетті емес"><Textarea rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
              <Button className="w-full" loading={busy} disabled={acc.role === 'student' ? !curator : contact.trim().length < 5} onClick={resubmit}>
                <Send className="size-4" /> Өтінішті қайта жіберу
              </Button>
            </div>
          )}
        </>
      )}

      <button onClick={logout} className="mt-6 inline-flex items-center gap-2 self-start text-sm font-semibold text-muted hover:text-berry-900">
        <LogOut className="size-4" /> Шығу
      </button>
    </AuthFrame>
  );
}
