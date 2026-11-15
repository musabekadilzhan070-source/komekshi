import Link from 'next/link';
import { Logo } from '@/components/shell/logo';

export function AuthFrame({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="min-h-dvh p-0 sm:p-4">
      <div className="mx-auto grid min-h-dvh max-w-6xl overflow-hidden bg-cream sm:min-h-[calc(100dvh-2rem)] sm:rounded-[32px] sm:shadow-lift lg:grid-cols-[1.05fr_1fr]">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-berry-900 p-10 text-white lg:flex">
          <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-berry-700/60" />
          <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-berry-800" />
          <Link href="/" className="relative"><Logo light /></Link>
          <div className="relative">{aside}</div>
          <p className="relative text-xs text-white/50">© {new Date().getFullYear()} KÓMEKSHI</p>
        </div>
        <div className="flex flex-col px-5 py-6 sm:px-10 sm:py-10">
          <Link href="/" className="mb-8 lg:hidden"><Logo /></Link>
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function AuthAside({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-md">
      <h2 className="text-4xl leading-[1.1] font-extrabold">{title}</h2>
      <p className="mt-4 text-[15px] leading-relaxed text-white/75">{text}</p>
      <div className="mt-8 grid grid-cols-3 gap-3 text-center">
        {['Жоспар', 'Трекер', 'Нәтиже'].map((t) => (
          <div key={t} className="rounded-2xl bg-white/10 px-3 py-4 text-xs font-semibold text-berry-200">{t}</div>
        ))}
      </div>
    </div>
  );
}
