'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './button';

const STACK: symbol[] = [];

export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md',
}: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode;
  footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panel = useRef<HTMLDivElement>(null);
  // onClose ата-ана компоненті қайта рендерленгенде өзгереді — фокусты қайта лақтырмау үшін ref арқылы
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    // Бір модаль ішінде екіншісі ашылса, Escape тек ең үстіңгісін жабады
    const id = Symbol('modal');
    STACK.push(id);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && STACK[STACK.length - 1] === id && closeRef.current();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Пайдаланушы өзі бір өріске фокус қойып үлгерсе, оны тартып алмаймыз
    const t = setTimeout(() => {
      if (panel.current && !panel.current.contains(document.activeElement)) {
        panel.current.querySelector<HTMLElement>('input,textarea,select,button[data-autofocus]')?.focus();
      }
    }, 30);
    return () => {
      clearTimeout(t);
      STACK.splice(STACK.indexOf(id), 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-brand-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        className={clsx(
          'animate-sheet-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-cream shadow-lift sm:rounded-[28px]',
          size === 'sm' && 'sm:max-w-md', size === 'md' && 'sm:max-w-xl', size === 'lg' && 'sm:max-w-3xl', size === 'xl' && 'sm:max-w-5xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 pt-5 pb-4 sm:px-7">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Жабу" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-ink ring-1 ring-line hover:bg-brand-50">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line bg-white/60 px-5 py-4 sm:px-7">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({
  open, onClose, onConfirm, title, text, confirmLabel = 'Растау', danger, loading,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; text: React.ReactNode;
  confirmLabel?: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Modal
      open={open} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Бас тарту</Button>
          <Button variant={danger ? 'accent' : 'primary'} onClick={onConfirm} loading={loading} data-autofocus>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink">{text}</div>
    </Modal>
  );
}
