'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { forwardRef } from 'react';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-150 select-none disabled:opacity-50 active:scale-[0.98]';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-900 text-white hover:bg-brand-800 shadow-sm',
  accent: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm',
  secondary: 'bg-white text-ink ring-1 ring-line hover:ring-brand-300 hover:bg-brand-50',
  ghost: 'text-ink hover:bg-brand-100/70',
  danger: 'bg-white text-bad ring-1 ring-bad/25 hover:bg-bad-soft',
  soft: 'bg-brand-100 text-brand-900 hover:bg-brand-200',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-xs',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-7 text-[15px]',
  icon: 'size-10',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={clsx(base, variants[variant], sizes[size], className)} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
});

export function LinkButton({
  href, variant = 'primary', size = 'md', className, children,
}: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={clsx(base, variants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}
