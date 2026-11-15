'use client';
import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { MoreVertical } from 'lucide-react';

export type MenuItem = { label: string; icon?: React.ComponentType<{ className?: string }>; onSelect: () => void; danger?: boolean; testId?: string };

/** Үш нүктелі әрекеттер мәзірі (пернетақтамен де басқарылады) */
export function ActionMenu({ items, label = 'Әрекеттер', className }: { items: MenuItem[]; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey, true);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const move = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
  };

  return (
    <div ref={root} className={clsx('relative', className)}>
      <button type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={clsx('flex size-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-mist', open && 'bg-mist')}>
        <MoreVertical className="size-4" />
      </button>
      {open && (
        <div id={id} role="menu" onKeyDown={move}
          className="animate-fade-in absolute top-full right-0 z-30 mt-1.5 min-w-52 overflow-hidden rounded-2xl bg-white p-1.5 shadow-lift ring-1 ring-line">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" data-testid={it.testId}
              onClick={() => { setOpen(false); it.onSelect(); }}
              className={clsx('flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold outline-none',
                it.danger ? 'text-bad hover:bg-bad-soft focus:bg-bad-soft' : 'text-ink hover:bg-mist focus:bg-mist')}>
              {it.icon && <it.icon className="size-4" />}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
