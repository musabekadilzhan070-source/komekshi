'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, LogIn } from 'lucide-react';
import { AuthAside, AuthFrame } from '@/components/auth/auth-frame';
import { Field, Input } from '@/components/ui/form';
import { Button } from '@/components/ui/button';

const MESSAGES: Record<string, string> = {
  bad: 'Қате код. Қайталап көріңіз',
  locked: 'Тым көп қате әрекет жасалды. 15 минуттан кейін қайталап көріңіз.',
  not_configured: 'Организатор кабинетіне кіру уақытша қолжетімсіз.',
  forbidden: 'Сұраныс қабылданбады.',
  server: 'Қате орын алды. Қайталап көріңіз.',
};

export default function OrganizerLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setError('Кодты енгізіңіз.');
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/organizer-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoading(false);
        setCode('');
        return setError(MESSAGES[body.error] ?? MESSAGES.server);
      }
      router.replace('/organizer');
      router.refresh();
    } catch {
      setLoading(false);
      setError('Желі байланысы жоқ. Интернетті тексеріңіз.');
    }
  };

  return (
    <AuthFrame aside={<AuthAside title="Платформаны басқару" text="Кураторлар мен оқушыларды, өтініштер мен статистиканы бір жерден басқарыңыз." />}>
      <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-navy-900 text-mist shadow-soft"><KeyRound className="size-6" /></span>
      <h1 className="text-3xl font-extrabold tracking-tight text-navy-900">Организатор кабинетіне кіру</h1>
      <p className="mt-2 text-sm text-muted">Арнайы кіру кодын енгізіңіз.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" autoComplete="off">
        <Field label="Кіру коды">
          <Input
            type="password" inputMode="numeric" autoComplete="off" maxLength={12} required value={code}
            onChange={(e) => { setError(null); setCode(e.target.value.replace(/\D/g, '')); }}
            className="text-center text-2xl font-bold tracking-[0.5em]" placeholder="••••••" aria-label="Кіру коды"
          />
        </Field>
        {error && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading}><LogIn className="size-4" /> Кіру</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-bold text-navy-700 hover:underline">Оқушы немесе куратор ретінде кіру</Link>
      </p>
    </AuthFrame>
  );
}
