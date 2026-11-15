import Link from 'next/link';
import {
  ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardList, GraduationCap, ListChecks, PlayCircle,
  ShieldCheck, TrendingUp, Users,
} from 'lucide-react';
import { Logo } from '@/components/shell/logo';
import { supabaseServer } from '@/lib/supabase/server';
import { Ornament } from '@/components/ui/ornament';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  let cabinet: string | null = null;
  if (user) {
    const { data } = await sb.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
    cabinet = data ? (data.status === 'active' ? '/' + data.role : '/pending') : '/pending';
  }

  return (
    <div className="min-h-dvh p-0 sm:p-4">
      <div className="mx-auto max-w-[1400px] overflow-hidden bg-cream sm:rounded-[32px] sm:shadow-lift">
        <header className="flex items-center justify-between gap-3 px-5 py-5 sm:px-10">
          <Logo />
          <nav className="flex items-center gap-2">
            {cabinet ? (
              <Link href={cabinet} className="inline-flex h-11 items-center gap-2 rounded-full bg-navy-900 px-5 text-sm font-semibold text-white hover:bg-navy-800">
                Кабинетке өту <ArrowRight className="size-4" />
              </Link>
            ) : (
              <>
                <Link href="/login" className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-navy-900 hover:bg-navy-100 sm:px-5">Кіру</Link>
                <Link href="/register" className="inline-flex h-11 items-center rounded-full bg-navy-900 px-5 text-sm font-semibold text-white hover:bg-navy-800">Тіркелу</Link>
              </>
            )}
          </nav>
        </header>

        <section className="px-4 pb-6 sm:px-10">
          <div className="relative overflow-hidden rounded-[28px] bg-navy-900 px-6 py-12 text-white sm:px-12 sm:py-16 lg:py-20">
            <Ornament kind="koshkar" className="absolute -top-16 -right-16 size-[420px] text-mist/[0.06]" strokeWidth={1.2} /><Ornament kind="tuietaban" className="absolute -bottom-10 left-6 size-40 text-mist/[0.05]" strokeWidth={1.6} />
            <div className="pointer-events-none absolute -bottom-40 right-48 size-80 rounded-full bg-navy-800" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-mist">
                  <GraduationCap className="size-4" /> Жеке оқу кеңістігі
                </span>
                <h1 className="mt-5 text-[34px] leading-[1.08] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                  Әр оқушыға жеке назар, әр күнге нақты жоспар
                </h1>
                <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/75 sm:text-base">
                  KÓMEKSHI — оқу нәтижесін жақсартқысы келетін оқушы мен оның кураторын бір кеңістікте біріктіреді:
                  жоспар, тапсырма, апталық трекер, кітап оқу есебі және сұрақ-жауап.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link href={cabinet ?? '/register'} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-bold text-navy-900 hover:bg-navy-100">
                    {cabinet ? 'Кабинетке өту' : 'Оқуды бастау'} <ArrowRight className="size-4" />
                  </Link>
                  {!cabinet && (
                    <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/10">
                      Менің аккаунтым бар
                    </Link>
                  )}
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="rounded-[24px] bg-cream p-5 text-ink shadow-lift">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-navy-900">Апталық прогресс</p>
                    <span className="rounded-full bg-navy-100 px-2.5 py-1 text-[11px] font-semibold text-navy-800">Мысал</span>
                  </div>
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-navy-100"><div className="h-full w-3/5 rounded-full bg-gradient-to-r from-navy-700 to-navy-900" /></div>
                  <div className="mt-5 space-y-2.5">
                    {['Тақырып: Квадрат теңдеулер', 'Тест: Қазақ тілі', 'Сабақ: Физика, 15:00'].map((t, i) => (
                      <div key={t} className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 text-sm">
                        <CheckCircle2 className={i < 2 ? 'size-5 text-navy-700' : 'size-5 text-navy-200'} />
                        <span className={i < 2 ? 'text-muted line-through' : 'font-semibold'}>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-6 sm:px-10">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: GraduationCap, title: 'Оқушы', text: 'Күнтізбе бойынша жоспар құрады, тапсырмаларды орындап, апталық трекерді толтырады, кітап оқу есебін жібереді.' },
              { icon: Users, title: 'Куратор', text: 'Өз тобындағы оқушылармен жеке жұмыс жүргізеді: жоспар, тапсырма, трекер, видео және статистика.' },
              { icon: ShieldCheck, title: 'Ұйымдастырушы', text: 'Кураторлар мен оқушыларды басқарады, өтініштерді қарастырады, платформаның жалпы нәтижесін бақылайды.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-[28px] bg-white p-6 shadow-soft transition-shadow hover:shadow-lift">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-navy-100 text-navy-700"><Icon className="size-6" /></span>
                <h3 className="mt-4 text-lg font-bold text-navy-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 pb-10 sm:px-10">
          <div className="rounded-[28px] bg-mist p-6 sm:p-10">
            <h2 className="text-2xl font-extrabold text-navy-900 sm:text-3xl">Оқу процесінің бәрі бір жерде</h2>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { icon: CalendarDays, t: 'Күнтізбелік жоспар' },
                { icon: ClipboardList, t: 'Жеке тапсырмалар' },
                { icon: ListChecks, t: 'Апталық трекер' },
                { icon: BookOpen, t: 'Кітап оқу есебі' },
                { icon: PlayCircle, t: 'Сұрақ-жауап видеосы' },
                { icon: TrendingUp, t: 'Нәтиже статистикасы' },
              ].map(({ icon: Icon, t }) => (
                <div key={t} className="flex flex-col items-start gap-3 rounded-3xl bg-cream p-4">
                  <Icon className="size-5 text-navy-700" />
                  <span className="text-sm font-semibold leading-tight text-navy-900">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-2 border-t border-line px-5 py-6 text-xs text-muted sm:flex-row sm:px-10">
          <span>© {new Date().getFullYear()} KÓMEKSHI</span>
          <span>Ә ә · Ғ ғ · Қ қ · Ң ң · Ө ө · Ұ ұ · Ү ү · Һ һ · І і</span>
        </footer>
      </div>
    </div>
  );
}
