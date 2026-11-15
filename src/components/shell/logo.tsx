import clsx from 'clsx';

export function LogoMark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={clsx('size-9 shrink-0', className)} aria-hidden>
      <rect width="40" height="40" rx="12" className={light ? 'fill-berry-300' : 'fill-berry-900'} />
      <path d="M13 11v18M13 20.5 24 11M16.5 17.5 26 29" fill="none" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className={light ? 'stroke-berry-950' : 'stroke-white'} />
      <circle cx="28.5" cy="12.5" r="2.6" className={light ? 'fill-berry-700' : 'fill-berry-300'} />
    </svg>
  );
}

export function Logo({ light, compactOnTablet }: { light?: boolean; compactOnTablet?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark light={light} />
      <span className={clsx('text-[17px] font-extrabold tracking-[0.06em]', light ? 'text-white' : 'text-berry-900', compactOnTablet && 'hidden lg:inline')}>
        KÓMEKSHI
      </span>
    </span>
  );
}
