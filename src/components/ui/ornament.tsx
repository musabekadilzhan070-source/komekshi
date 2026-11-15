/**
 * Қазақ ою-өрнегінің заманауи геометриялық нұсқалары.
 * Тек бірнеше жерде, өте нәзік қолданылады: sidebar төменгі бөлігі, авторизация фоны,
 * басты беттегі баннер бұрышы, бөлім атауының жанындағы белгі, кейбір карточка бұрыштары.
 * Барлығы `currentColor` арқылы боялады.
 */
import clsx from 'clsx';

export type OrnamentKind = 'koshkar' | 'botakoz';

type Props = { kind?: OrnamentKind; className?: string; strokeWidth?: number; title?: string };

/** Қошқармүйіз: сабақ, екі иірілген мүйіз және төменгі ромб */
function Koshkar({ sw }: { sw: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17V10" />
      <path d="M12 10V8.5a3.5 3.5 0 1 0-7 0a1.75 1.75 0 1 0 3.5 0" />
      <path d="M12 10V8.5a3.5 3.5 0 1 1 7 0a1.75 1.75 0 1 1-3.5 0" />
      <path d="M12 17l2 2-2 2-2-2z" />
    </g>
  );
}

/** Ботакөз: ромб ішіндегі ромб */
function Botakoz({ sw }: { sw: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l9 9-9 9-9-9z" />
      <path d="M12 8.5l3.5 3.5-3.5 3.5L8.5 12z" />
    </g>
  );
}

const MAP = { koshkar: Koshkar, botakoz: Botakoz };

export function Ornament({ kind = 'koshkar', className, strokeWidth = 1.5, title }: Props) {
  const Shape = MAP[kind];
  return (
    <svg viewBox="0 0 24 24" className={clsx('pointer-events-none', className)} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <Shape sw={strokeWidth} />
    </svg>
  );
}

/** Sidebar төменгі бөлігіндегі жіңішке ою жолағы */
export function OrnamentBand({ className, count = 7 }: { className?: string; count?: number }) {
  return (
    <div className={clsx('pointer-events-none flex items-center justify-center gap-2.5', className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Ornament key={i} kind={i % 2 ? 'botakoz' : 'koshkar'} className={i % 2 ? 'size-2.5' : 'size-4'} strokeWidth={i % 2 ? 2 : 1.6} />
      ))}
    </div>
  );
}

/** Авторизация бетінің фонына арналған өте нәзік геометриялық өрнек */
export function OrnamentPattern({ className, id = 'kom-orn', size = 72 }: { className?: string; id?: string; size?: number }) {
  const s = size / 72;
  return (
    <svg className={clsx('pointer-events-none absolute inset-0 size-full', className)} aria-hidden>
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
          <g transform={`scale(${s})`}>
            <g transform="translate(6 6)"><Koshkar sw={1.3} /></g>
            <g transform="translate(42 42) scale(.75)"><Botakoz sw={1.6} /></g>
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** Бөлім атауының жанындағы шағын белгі */
export function OrnamentDivider({ className }: { className?: string }) {
  return (
    <div className={clsx('pointer-events-none flex items-center gap-1.5 text-brand-700', className)} aria-hidden>
      <Ornament kind="koshkar" className="size-4" strokeWidth={1.8} />
      <span className="h-px w-6 bg-brand-200" />
    </div>
  );
}
