/**
 * Қазақтың ұлттық ою-өрнектері — нәзік декоративті SVG элементтер.
 * Барлығы `currentColor` арқылы боялады, сондықтан түсі мен мөлдірлігін
 * ата-ана элементтің text-* / opacity-* класстары арқылы басқарамыз.
 */
import clsx from 'clsx';

export type OrnamentKind = 'koshkar' | 'tuietaban' | 'botakoz' | 'kuskanaty';

type Props = { kind?: OrnamentKind; className?: string; strokeWidth?: number; title?: string };

/** Қошқармүйіз — ортадағы сабақ пен екі жаққа иірілген мүйіз */
function Koshkar({ sw }: { sw: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 92V58" />
      <path d="M50 58C50 34 33 20 19 26C8 31 9 47 20 50C29 52 33 43 28 38C24 34 18 38 21 42" />
      <path d="M50 58C50 34 67 20 81 26C92 31 91 47 80 50C71 52 67 43 72 38C76 34 82 38 79 42" />
      <path d="M50 72C42 66 34 67 30 73C27 78 31 84 37 82" />
      <path d="M50 72C58 66 66 67 70 73C73 78 69 84 63 82" />
      <path d="M50 8L54 16L50 24L46 16Z" />
    </g>
  );
}

/** Түйетабан — төрт жапырақты табан ізі */
function Tuietaban({ sw }: { sw: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 44C42 38 38 26 44 16C47 11 53 11 56 16C62 26 58 38 50 44Z" />
      <path d="M50 56C58 62 62 74 56 84C53 89 47 89 44 84C38 74 42 62 50 56Z" />
      <path d="M44 50C38 58 26 62 16 56C11 53 11 47 16 44C26 38 38 42 44 50Z" />
      <path d="M56 50C62 42 74 38 84 44C89 47 89 53 84 56C74 62 62 58 56 50Z" />
      <circle cx="50" cy="50" r="3.2" />
    </g>
  );
}

/** Ботакөз — ромб ішіндегі ромб және көз */
function Botakoz({ sw }: { sw: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 10L90 50L50 90L10 50Z" />
      <path d="M50 28L72 50L50 72L28 50Z" />
      <path d="M36 50C41 43 59 43 64 50C59 57 41 57 36 50Z" />
      <circle cx="50" cy="50" r="3" fill="currentColor" stroke="none" />
      <path d="M50 2V8M50 92V98M2 50H8M92 50H98" />
    </g>
  );
}

/** Құсқанаты — екі жаққа жайылған қанат */
function Kuskanaty({ sw }: { sw: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 78C40 62 22 52 8 52C20 44 36 44 50 56" />
      <path d="M50 78C60 62 78 52 92 52C80 44 64 44 50 56" />
      <path d="M50 56C42 42 28 32 14 30C26 24 42 28 50 40" />
      <path d="M50 56C58 42 72 32 86 30C74 24 58 28 50 40" />
      <path d="M50 40C46 30 46 20 50 12C54 20 54 30 50 40Z" />
      <path d="M50 78V90" />
    </g>
  );
}

const MAP = { koshkar: Koshkar, tuietaban: Tuietaban, botakoz: Botakoz, kuskanaty: Kuskanaty };

export function Ornament({ kind = 'koshkar', className, strokeWidth = 2.2, title }: Props) {
  const Shape = MAP[kind];
  return (
    <svg viewBox="0 0 100 100" className={clsx('pointer-events-none', className)} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <Shape sw={strokeWidth} />
    </svg>
  );
}

/** Қайталанатын ою жолағы (тақырып астында, sidebar төменгі бөлігінде) */
export function OrnamentBand({ className, kind = 'koshkar', count = 5 }: { className?: string; kind?: OrnamentKind; count?: number }) {
  return (
    <div className={clsx('pointer-events-none flex items-center gap-1', className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Ornament key={i} kind={i % 2 ? 'botakoz' : kind} className="size-full max-h-full" strokeWidth={i % 2 ? 3 : 2.6} />
      ))}
    </div>
  );
}

/** Фон үшін қайталанатын өрнек (SVG pattern) — абсолютті орналасқан қабат */
export function OrnamentPattern({ className, id = 'kom-orn', size = 120 }: { className?: string; id?: string; size?: number }) {
  return (
    <svg className={clsx('pointer-events-none absolute inset-0 size-full', className)} aria-hidden>
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
          <g transform={`scale(${size / 200})`}>
            <g transform="translate(0 0)"><Koshkar sw={2} /></g>
            <g transform="translate(100 100)"><Koshkar sw={2} /></g>
            <g transform="translate(100 0) translate(25 25) scale(.5)"><Botakoz sw={3.4} /></g>
            <g transform="translate(0 100) translate(25 25) scale(.5)"><Tuietaban sw={3.4} /></g>
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** Бөлім тақырыбының жанындағы шағын белгі */
export function OrnamentDivider({ className }: { className?: string }) {
  return (
    <div className={clsx('pointer-events-none flex items-center gap-2 text-sand-500', className)} aria-hidden>
      <span className="h-px w-8 bg-current opacity-60" />
      <Ornament kind="botakoz" className="size-3.5" strokeWidth={5} />
      <span className="h-px w-8 bg-current opacity-60" />
    </div>
  );
}
