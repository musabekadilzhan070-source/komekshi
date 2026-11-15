'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-ink">Қате орын алды</h1>
        <p className="mt-2 text-sm text-muted">Бетті жүктеу мүмкін болмады. Қайталап көріңіз.</p>
        <button onClick={reset} className="mt-6 inline-flex h-11 items-center rounded-full bg-brand-900 px-6 text-sm font-semibold text-white">Қайталау</button>
      </div>
    </div>
  );
}
