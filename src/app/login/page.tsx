'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { humanError } from '@/lib/errors';
import { AuthAside, AuthFrame } from '@/components/auth/auth-frame';
import { Field, Input } from '@/components/ui/form';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      return setError(humanError(error));
    }
    const { data } = await sb.rpc('my_account');
    const target = data && data.status === 'active' ? '/' + data.role : '/pending';
    router.replace(target);
    router.refresh();
  };

  return (
    <AuthFrame aside={<AuthAside title="Қайта оралғаныңызға қуаныштымыз" text="Жеке оқу кеңістігіңізге кіріп, бүгінгі жоспар мен тапсырмаларыңызды жалғастырыңыз." />}>
      <h1 className="text-3xl font-extrabold tracking-tight text-berry-900">Кіру</h1>
      <p className="mt-2 text-sm text-muted">Электронды пошта мен құпиясөзіңізді енгізіңіз.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Электронды пошта">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@mail.kz" />
        </Field>
        <Field label="Құпиясөз">
          <div className="relative">
            <Input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Құпиясөзді жасыру' : 'Құпиясөзді көрсету'} className="absolute inset-y-0 right-3 my-auto flex size-8 items-center justify-center rounded-full text-muted hover:bg-berry-50">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        {error && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading}><LogIn className="size-4" /> Кіру</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Аккаунтыңыз жоқ па? <Link href="/register" className="font-bold text-berry-700 hover:underline">Тіркелу</Link>
      </p>
    </AuthFrame>
  );
}
