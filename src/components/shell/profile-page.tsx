'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Save } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { humanError } from '@/lib/errors';
import { ROLE_LABEL } from '@/lib/labels';
import { shortDate } from '@/lib/date';
import { useAccount } from './account-context';
import { useToast } from '@/components/ui/toast';
import { Avatar, Badge, Card, PageHeader } from '@/components/ui/misc';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { Button } from '@/components/ui/button';

export function ProfilePage() {
  const account = useAccount();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(account.full_name);
  const [contact, setContact] = useState(account.contact_info ?? '');
  const [bio, setBio] = useState(account.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [accepting, setAccepting] = useState<boolean | null>(null);

  useEffect(() => {
    if (account.role !== 'curator') return;
    supabaseBrowser().from('curators').select('accepting_students').eq('id', account.id).single()
      .then(({ data }) => setAccepting(data?.accepting_students ?? true));
  }, [account.id, account.role]);

  const toggleAccepting = async (v: boolean) => {
    setAccepting(v);
    const { error } = await supabaseBrowser().from('curators').update({ accepting_students: v }).eq('id', account.id);
    if (error) { setAccepting(!v); return toast.error(humanError(error)); }
    toast.success(v ? 'Сіз тіркелу тізімінде көрінесіз' : 'Жаңа оқушылар сізді таңдай алмайды');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error('Аты-жөніңізді толық енгізіңіз.');
    setSaving(true);
    const { error } = await supabaseBrowser().from('profiles')
      .update({ full_name: name.trim(), contact_info: contact.trim() || null, bio: bio.trim() || null })
      .eq('id', account.id);
    setSaving(false);
    if (error) return toast.error(humanError(error));
    toast.success('Профиль сақталды');
    router.refresh();
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error('Құпиясөз кемінде 8 таңба болуы керек.');
    if (pw !== pw2) return toast.error('Құпиясөздер сәйкес келмейді.');
    setPwSaving(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setPwSaving(false);
    if (error) return toast.error(humanError(error));
    setPw(''); setPw2('');
    toast.success('Құпиясөз жаңартылды');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Профиль" subtitle="Жеке деректер және қауіпсіздік" />
      <Card className="mb-4 flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <Avatar name={account.full_name} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-berry-900">{account.full_name}</p>
          <p className="truncate text-sm text-muted">{account.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="berry">{ROLE_LABEL[account.role]}</Badge>
            <Badge tone="ok">Белсенді</Badge>
            <Badge>Тіркелген: {shortDate(account.created_at)}</Badge>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <form onSubmit={save} className="space-y-4">
            <h2 className="font-bold text-berry-900">Жеке деректер</h2>
            <Field label="Аты-жөні" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
            <Field label="Байланыс ақпараты" hint="Телефон, Telegram т.б."><Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={300} /></Field>
            {account.role === 'curator' && (
              <Field label="Өзім туралы" hint="Оқушылар куратор таңдағанда көреді"><Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} rows={3} /></Field>
            )}
            <Button type="submit" loading={saving}><Save className="size-4" /> Сақтау</Button>
          </form>
          {account.role === 'curator' && accepting !== null && (
            <div className="mt-5 border-t border-line pt-4">
              <Checkbox checked={accepting} onChange={toggleAccepting}
                label={<><b>Жаңа оқушылардан өтініш қабылдаймын</b><span className="block text-xs text-muted">Өшірілсе, тіркелу кезіндегі кураторлар тізімінде көрінбейсіз</span></>} />
            </div>
          )}
        </Card>
        <Card className="p-5 sm:p-6">
          <form onSubmit={changePassword} className="space-y-4">
            <h2 className="font-bold text-berry-900">Құпиясөзді өзгерту</h2>
            <Field label="Жаңа құпиясөз" hint="Кемінде 8 таңба"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Құпиясөзді қайталаңыз"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            <Button type="submit" variant="secondary" loading={pwSaving}><KeyRound className="size-4" /> Жаңарту</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
