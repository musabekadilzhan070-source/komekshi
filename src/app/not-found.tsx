import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <p className="text-5xl font-extrabold text-berry-700">404</p>
        <h1 className="mt-2 text-xl font-bold text-berry-900">Бет табылмады</h1>
        <p className="mt-2 text-sm text-muted">Сіз іздеген бет жоқ немесе оған рұқсатыңыз жоқ.</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-berry-900 px-6 text-sm font-semibold text-white">Басты бетке</Link>
      </div>
    </div>
  );
}
