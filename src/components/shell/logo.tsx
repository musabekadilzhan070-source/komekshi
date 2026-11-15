import clsx from 'clsx';

/**
 * KÓMEKSHI белгісі: «K» әрпі, оның екі иығы қошқармүйіз иірімімен аяқталады.
 * Бір ғана символ — әріп пен қазақы өрнек бір пішінде.
 */
export const LOGO_GLYPH = [
  'M13 10v20',
  'M13 20C18.5 20 21 16.5 22.3 13.6C23.5 10.8 28.4 10.6 28.6 14C28.8 16.6 25.6 17.3 24.8 15.1',
  'M13 20C18.5 20 21 23.5 22.3 26.4C23.5 29.2 28.4 29.4 28.6 26C28.8 23.4 25.6 22.7 24.8 24.9',
];

/** Қысқартылған логотип — тек белгі (sidebar, мобильді навигация, favicon) */
export function LogoMark({ className, light, title }: { className?: string; light?: boolean; title?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={clsx('size-9 shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <rect width="40" height="40" rx="11" className={light ? 'fill-white' : 'fill-brand-900'} />
      <g fill="none" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className={light ? 'stroke-brand-900' : 'stroke-white'}>
        {LOGO_GLYPH.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}

/** Толық логотип — белгі + KÓMEKSHI жазуы (авторизация, таныстыру беті) */
export function Logo({ light, size = 'md', className }: { light?: boolean; size?: 'md' | 'lg'; className?: string }) {
  return (
    <span className={clsx('flex items-center', size === 'lg' ? 'gap-3' : 'gap-2.5', className)}>
      <LogoMark light={light} className={size === 'lg' ? 'size-11' : 'size-9'} />
      <span className={clsx('font-extrabold leading-none tracking-[0.14em]', size === 'lg' ? 'text-xl' : 'text-[17px]', light ? 'text-white' : 'text-ink')}>
        KÓMEKSHI
      </span>
    </span>
  );
}
