'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; text: string }
interface ToastApi { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }

const Ctx = createContext<ToastApi | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = ++counter;
    setItems((l) => [...l.slice(-3), { id, kind, text }]);
    setTimeout(() => remove(id), kind === 'error' ? 6000 : 3500);
  }, [remove]);
  const api: ToastApi = {
    success: (t) => push('success', t),
    error: (t) => push('error', t),
    info: (t) => push('info', t),
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 sm:top-auto sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={clsx(
              'animate-fade-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-lift',
              t.kind === 'success' && 'bg-navy-900 text-white',
              t.kind === 'error' && 'bg-white text-bad ring-1 ring-bad/20',
              t.kind === 'info' && 'bg-white text-ink ring-1 ring-line',
            )}
          >
            {t.kind === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sand-300" />}
            {t.kind === 'error' && <AlertCircle className="mt-0.5 size-4 shrink-0" />}
            {t.kind === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-navy-700" />}
            <span className="flex-1 leading-snug">{t.text}</span>
            <button onClick={() => remove(t.id)} aria-label="Жабу" className="opacity-60 hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('ToastProvider жоқ');
  return c;
}
