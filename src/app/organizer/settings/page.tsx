'use client';
import { useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { dateTime } from '@/lib/date';
import { useAccount } from '@/components/shell/account-context';
import { Card, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/misc';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface Settings {
  platform_name: string; student_registration_open: boolean; curator_registration_open: boolean;
  max_video_mb: number; welcome_message: string | null; updated_at: string;
}

export default function OrganizerSettingsPage() {
  const me = useAccount();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(async () => must(await supabaseBrowser().from('platform_settings').select('*').single()) as Settings, []);
  const [f, setF] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setF(data); }, [data]);

  const save = async () => {
    if (!f) return;
    if (!f.platform_name.trim()) return toast.error('Платформа атауын енгізіңіз.');
    if (f.max_video_mb < 10 || f.max_video_mb > 500) return toast.error('Видео көлемі 10–500 МБ аралығында болуы керек.');
    setSaving(true);
    const { error } = await supabaseBrowser().from('platform_settings').update({
      platform_name: f.platform_name.trim(), student_registration_open: f.student_registration_open,
      curator_registration_open: f.curator_registration_open, max_video_mb: f.max_video_mb,
      welcome_message: f.welcome_message?.trim() || null, updated_at: new Date().toISOString(), updated_by: me.id,
    }).eq('id', 1);
    setSaving(false);
    if (error) return toast.error(humanError(error));
    toast.success('Баптаулар сақталды');
    reload(true);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Платформа баптаулары" subtitle={data ? `Соңғы өзгеріс: ${dateTime(data.updated_at)}` : undefined} />
      {loading || !f ? <LoadingBlock /> : error ? <ErrorState text={error} onRetry={reload} /> : (
        <div className="space-y-4">
          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="font-bold text-berry-900">Жалпы</h2>
            <Field label="Платформа атауы"><Input value={f.platform_name} onChange={(e) => setF({ ...f, platform_name: e.target.value })} maxLength={80} /></Field>
            <Field label="Хабарландыру мәтіні" hint="Ішкі ақпарат ретінде сақталады"><Textarea rows={3} value={f.welcome_message ?? ''} onChange={(e) => setF({ ...f, welcome_message: e.target.value })} maxLength={1000} /></Field>
          </Card>
          <Card className="space-y-2 p-5 sm:p-6">
            <h2 className="mb-2 font-bold text-berry-900">Тіркелу</h2>
            <Checkbox checked={f.student_registration_open} onChange={(v) => setF({ ...f, student_registration_open: v })} label={<><b>Оқушылардың тіркелуі ашық</b><span className="block text-xs text-muted">Өшірілсе, жаңа оқушылар өтініш жібере алмайды</span></>} />
            <Checkbox checked={f.curator_registration_open} onChange={(v) => setF({ ...f, curator_registration_open: v })} label={<><b>Кураторлардың тіркелуі ашық</b><span className="block text-xs text-muted">Өшірілсе, жаңа кураторлар өтініш жібере алмайды</span></>} />
          </Card>
          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="font-bold text-berry-900">Видео жүктеу шектеуі</h2>
            <Field label="Бір видеоның ең үлкен көлемі, МБ" hint="10–500 МБ. Рұқсат етілген форматтар: MP4, WebM, MOV, M4V, OGG">
              <Input type="number" min={10} max={500} value={f.max_video_mb} onChange={(e) => setF({ ...f, max_video_mb: Number(e.target.value) })} />
            </Field>
          </Card>
          <Card className="flex gap-3 p-5 text-sm sm:p-6">
            <ShieldCheck className="size-5 shrink-0 text-berry-700" />
            <p className="text-muted">Жаңа организатор аккаунтын тек сервер деңгейіндегі бастапқы баптау скрипті арқылы қосуға болады (<code className="rounded bg-mist px-1">npm run create-organizer</code>). Қарапайым тіркелу арқылы организатор болу мүмкін емес.</p>
          </Card>
          <div className="flex justify-end"><Button onClick={save} loading={saving}><Save className="size-4" /> Сақтау</Button></div>
        </div>
      )}
    </div>
  );
}
