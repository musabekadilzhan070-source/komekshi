'use client';
import clsx from 'clsx';
import { forwardRef } from 'react';

export function Field({ label, hint, error, children, className, required, group }: {
  label: string; hint?: string; error?: string | null; children: React.ReactNode; className?: string; required?: boolean;
  /** Ішінде бірнеше батырма бар күрделі элемент болса — <label> емес, <div role="group"> */
  group?: boolean;
}) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={clsx('block', className)} {...(group ? { role: 'group', 'aria-label': label } : {})}>
      <span className="mb-1.5 block text-xs font-semibold text-ink">
        {label}{required && <span className="text-brand-700"> *</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </Tag>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx('field-input', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={clsx('field-input resize-y leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={clsx(
        'field-input appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22%23000000%22%20stroke-width%3D%222%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx('flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-brand-50', disabled && 'opacity-50')}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex size-5 shrink-0 items-center justify-center rounded-md border-2 border-brand-300 bg-white transition-colors peer-checked:border-brand-700 peer-checked:bg-brand-700 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100">
        <svg viewBox="0 0 24 24" className={clsx('size-3.5 text-white', !checked && 'opacity-0')} fill="none" stroke="currentColor" strokeWidth={3.5}><path d="m5 12 5 5 9-10" /></svg>
      </span>
      <span className="min-w-0 flex-1 text-sm">{label}</span>
    </label>
  );
}
