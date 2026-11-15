'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Check, GraduationCap, MailCheck, Send, Users } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { humanError } from '@/lib/errors';
import { AuthAside, AuthFrame } from '@/components/auth/auth-frame';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { CuratorPicker } from '@/components/auth/curator-picker';

type Role = 'student' | 'curator';
interface Settings { student_registration_open: boolean; curator_registration_open: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [curatorId, setCuratorId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    supabaseBrowser().from('platform_settings').select('student_registration_open,curator_registration_open').single()
      .then(({ data }) => setSettings(data ?? { student_registration_open: true, curator_registration_open: true }));
  }, []);

  const validateAccount = () => {
    const e: Record<string, string> = {};
    if (name.trim().split(/\s+/).length < 2 || name.trim().length < 4) e.name = 'Атыңыз бен тегіңізді толық жазыңыз.';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Электронды пошта дұрыс емес.';
    if (password.length < 8) e.password = 'Құпиясөз кемінде 8 таңба болуы керек.';
    else if (!/[0-9]/.test(password) || !/[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]/.test(password)) e.password = 'Құпиясөзде әріп пен сан болсын.';
    if (password2 !== password) e.password2 = 'Құпиясөздер сәйкес келмейді.';
    if (role === 'curator' && contact.trim().length < 5) e.contact = 'Байланыс ақпаратын енгізіңіз (телефон, Telegram).';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (role === 'student' && !curatorId) return setSubmitError('Кураторды таңдаңыз.');
    setLoading(true);
    const sb = supabaseBrowser();
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          role,
          full_name: name.trim().replace(/\s+/g, ' '),
          curator_id: role === 'student' ? curatorId : undefined,
          contact_info: role === 'curator' ? contact.trim() : undefined,
          message: message.trim() || undefined,
        },
      },
    });
    setLoading(false);
    if (error) return setSubmitError(humanError(error));
    // Пошта бұрын тіркелген жағдайда Supabase бос identities қайтарады
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return setSubmitError('Бұл поштамен аккаунт бұрыннан тіркелген.');
    }
    if (data.session) {
      router.replace('/pending');
      router.refresh();
    } else {
      setConfirmSent(true);
    }
  };

  if (confirmSent) {
    return (
      <AuthFrame aside={<AuthAside title="Өтініш жіберілді" text="Поштаңызды растағаннан кейін өтінішіңіздің күйін бақылай аласыз." />}>
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-3xl bg-navy-100 text-navy-700"><MailCheck className="size-8" /></div>
          <h1 className="text-2xl font-extrabold text-navy-900">Поштаңызды тексеріңіз</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            <b className="text-ink">{email}</b> мекенжайына растау хаты жіберілді. Сілтемені басқаннан кейін өтінішіңіздің күйін көре аласыз.
          </p>
          <Link href="/login" className="mt-6 inline-block font-bold text-navy-700 hover:underline">Кіру бетіне өту</Link>
        </div>
      </AuthFrame>
    );
  }

  const roleClosed = (r: Role) => settings && !(r === 'student' ? settings.student_registration_open : settings.curator_registration_open);
  const totalSteps = role === 'student' ? 3 : 2;

  return (
    <AuthFrame aside={<AuthAside title="Жеке оқу жолыңызды бастаңыз" text="Куратор сізбен жеке жұмыс жүргізеді: жоспар құрады, тапсырма береді және нәтижеңізді бірге бақылайды." />}>
      <div className="mb-6 flex items-center gap-2" aria-label={`Қадам ${step} / ${totalSteps}`}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span key={i} className={clsx('h-1.5 flex-1 rounded-full transition-colors', i < step ? 'bg-navy-700' : 'bg-navy-100')} />
        ))}
      </div>

      {step === 1 && (
        <>
          <h1 className="text-3xl font-extrabold tracking-tight text-navy-900">Тіркелу</h1>
          <p className="mt-2 text-sm text-muted">Платформаға кім ретінде қосыласыз?</p>
          <div className="mt-6 grid gap-3">
            {([
              { r: 'student' as Role, icon: GraduationCap, title: 'Оқушы', text: 'Кураторыңызды таңдап, оның тобына өтініш жібересіз.' },
              { r: 'curator' as Role, icon: Users, title: 'Куратор', text: 'Өтінішті ұйымдастырушы мақұлдағаннан кейін оқушылармен жұмыс істейсіз.' },
            ]).map(({ r, icon: Icon, title, text }) => (
              <button
                key={r}
                disabled={!!roleClosed(r)}
                onClick={() => setRole(r)}
                className={clsx(
                  'flex items-start gap-4 rounded-3xl border-2 p-4 text-left transition-all',
                  role === r ? 'border-navy-700 bg-navy-50' : 'border-line bg-white hover:border-navy-300',
                  roleClosed(r) && 'opacity-50',
                )}
              >
                <span className={clsx('flex size-12 shrink-0 items-center justify-center rounded-2xl', role === r ? 'bg-navy-700 text-white' : 'bg-navy-100 text-navy-700')}>
                  <Icon className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-navy-900">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{roleClosed(r) ? 'Тіркелу уақытша жабық' : text}</span>
                </span>
                {role === r && <Check className="size-5 text-navy-700" />}
              </button>
            ))}
          </div>
          <Button size="lg" className="mt-6 w-full" disabled={!role} onClick={() => setStep(2)}>
            Жалғастыру <ArrowRight className="size-4" />
          </Button>
        </>
      )}

      {step === 2 && role && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!validateAccount()) return;
            if (role === 'student') setStep(3);
            else submit();
          }}
          className="space-y-4"
          noValidate
        >
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{role === 'student' ? 'Оқушы аккаунты' : 'Куратор аккаунты'}</h1>
            <p className="mt-1 text-sm text-muted">Деректеріңізді енгізіңіз.</p>
          </div>
          <Field label="Аты-жөні" required error={errors.name}>
            <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Мысалы: Әлішер Құрманғали" maxLength={120} />
          </Field>
          <Field label="Электронды пошта" required error={errors.email}>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@mail.kz" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Құпиясөз" required error={errors.password} hint="Кемінде 8 таңба, әріп пен сан">
              <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Құпиясөзді қайталаңыз" required error={errors.password2}>
              <Input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </Field>
          </div>
          {role === 'curator' && (
            <>
              <Field label="Байланыс ақпараты" required error={errors.contact} hint="Телефон нөмірі, Telegram немесе басқа байланыс">
                <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+7 7xx xxx xx xx" maxLength={300} />
              </Field>
              <Field label="Ұйымдастырушыға хабарлама" hint="Тәжірибеңіз, пәніңіз туралы қысқаша (міндетті емес)">
                <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
              </Field>
            </>
          )}
          {submitError && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{submitError}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" size="lg" onClick={() => setStep(1)}><ArrowLeft className="size-4" /></Button>
            <Button type="submit" size="lg" className="flex-1" loading={loading}>
              {role === 'student' ? <>Куратор таңдау <ArrowRight className="size-4" /></> : <><Send className="size-4" /> Өтініш жіберу</>}
            </Button>
          </div>
        </form>
      )}

      {step === 3 && role === 'student' && (
        <CuratorStep
          selected={curatorId}
          onSelect={setCuratorId}
          message={message}
          setMessage={setMessage}
          error={submitError}
          loading={loading}
          onBack={() => setStep(2)}
          onSubmit={submit}
        />
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Аккаунтыңыз бар ма? <Link href="/login" className="font-bold text-navy-700 hover:underline">Кіру</Link>
      </p>
    </AuthFrame>
  );
}

function CuratorStep({
  selected, onSelect, message, setMessage, error, loading, onBack, onSubmit,
}: {
  selected: string | null; onSelect: (id: string) => void; message: string; setMessage: (s: string) => void;
  error: string | null; loading: boolean; onBack: () => void; onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Куратор таңдау</h1>
        <p className="mt-1 text-sm text-muted">Өтінішіңіз таңдалған куратордың кабинетіне түседі.</p>
      </div>
      <CuratorPicker selected={selected} onSelect={onSelect} />
      <Field label="Кураторға хабарлама" hint="Міндетті емес">
        <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Мысалы: 9-сынып, математикадан көмек керек" />
      </Field>
      {error && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{error}</p>}
      <div className="flex gap-3">
        <Button variant="secondary" size="lg" onClick={onBack}><ArrowLeft className="size-4" /></Button>
        <Button size="lg" className="flex-1" disabled={!selected} loading={loading} onClick={onSubmit}>
          <Send className="size-4" /> Өтініш жіберу
        </Button>
      </div>
    </div>
  );
}
