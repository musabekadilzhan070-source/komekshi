'use client';
import clsx from 'clsx';
import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-react';
import type { Tone } from '@/lib/labels';

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('card', className)} {...rest}>{children}</div>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-berry-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-berry-900 sm:text-[28px]">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

const tones: Record<Tone, string> = {
  berry: 'bg-berry-100 text-berry-800',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  bad: 'bg-bad-soft text-bad',
  neutral: 'bg-mist text-muted',
  soft: 'bg-white/15 text-white',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, className, tone = 'berry' }: { value: number | null; className?: string; tone?: 'berry' | 'light' }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div
      role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}
      className={clsx('h-2 w-full overflow-hidden rounded-full', tone === 'berry' ? 'bg-berry-100' : 'bg-white/20', className)}
    >
      <div
        className={clsx('h-full rounded-full transition-[width] duration-500', tone === 'berry' ? 'bg-gradient-to-r from-berry-700 to-berry-900' : 'bg-white')}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function ProgressRing({ value, size = 120, stroke = 10, light = false, label }: { value: number | null; size?: number; stroke?: number; light?: boolean; label?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={light ? 'stroke-white/15' : 'stroke-berry-100'} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * v) / 100}
          className={clsx('transition-[stroke-dashoffset] duration-700', light ? 'stroke-berry-300' : 'stroke-berry-700')}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={clsx('font-extrabold leading-none', light ? 'text-white' : 'text-berry-900')} style={{ fontSize: size * 0.24 }}>
          {value == null ? '—' : `${v}%`}
        </span>
        {label && <span className={clsx('mt-1 text-[11px]', light ? 'text-white/70' : 'text-muted')}>{label}</span>}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-berry-700', className)} />;
}

export function LoadingBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('space-y-3', className)} aria-busy="true" aria-label="Жүктелуде">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-16 rounded-2xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox, title, text, action, className,
}: { icon?: React.ComponentType<{ className?: string }>; title: string; text?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center rounded-xl3 border border-dashed border-berry-200 bg-white/50 px-6 py-10 text-center', className)}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-berry-100 text-berry-700">
        <Icon className="size-6" />
      </div>
      <p className="font-bold text-berry-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl3 bg-bad-soft/60 px-6 py-8 text-center">
      <AlertTriangle className="mb-2 size-6 text-bad" />
      <p className="text-sm font-semibold text-bad">{text}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-berry-900 hover:underline">
          <RotateCw className="size-4" /> Қайта жүктеу
        </button>
      )}
    </div>
  );
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 3;
  const bg = ['bg-berry-200 text-berry-900', 'bg-berry-700 text-white', 'bg-berry-900 text-berry-200'][hue];
  return (
    <div
      className={clsx('flex shrink-0 items-center justify-center rounded-full font-bold', bg, className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials || '•'}
    </div>
  );
}

export function StatCard({
  label, value, hint, icon: Icon, tone = 'light', className,
}: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: 'light' | 'dark' | 'accent'; className?: string }) {
  return (
    <div
      className={clsx(
        'rounded-xl3 p-4 sm:p-5 transition-shadow duration-200 hover:shadow-lift',
        tone === 'light' && 'bg-cream shadow-soft',
        tone === 'dark' && 'bg-berry-900 text-white',
        tone === 'accent' && 'bg-berry-700 text-white',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={clsx('text-xs font-semibold leading-tight', tone === 'light' ? 'text-muted' : 'text-white/75')}>{label}</p>
        {Icon && (
          <span className={clsx('flex size-8 shrink-0 items-center justify-center rounded-xl', tone === 'light' ? 'bg-berry-100 text-berry-700' : 'bg-white/15 text-white')}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className={clsx('mt-2 text-2xl font-extrabold tracking-tight sm:text-[28px]', tone === 'light' ? 'text-berry-900' : 'text-white')}>{value}</p>
      {hint && <p className={clsx('mt-1 text-xs', tone === 'light' ? 'text-muted' : 'text-white/70')}>{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({
  value, onChange, items, className,
}: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div className={clsx('scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={clsx(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
            value === it.value ? 'bg-berry-900 text-white' : 'bg-white/70 text-berry-900 hover:bg-white',
          )}
        >
          {it.label}
          {it.count != null && (
            <span className={clsx('rounded-full px-1.5 text-[11px]', value === it.value ? 'bg-white/20' : 'bg-berry-100')}>{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
