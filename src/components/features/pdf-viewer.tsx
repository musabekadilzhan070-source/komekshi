'use client';
/**
 * PDF Reader (PDF.js viewer компоненті).
 * Беттер сурет ретінде емес, PDF.js арқылы векторлық түрде салынады, мәтін қабаты сақталады
 * (мәтінді белгілеп, көшіруге болады). Ашылғанда әдепкі режим — экран еніне сәйкестендіру (Fit to Width).
 */
import 'pdfjs-dist/legacy/web/pdf_viewer.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  ChevronLeft, ChevronRight, Download, Expand, Maximize2, Minimize2, MoveHorizontal, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { Spinner } from '@/components/ui/misc';

type FitMode = 'page-width' | 'page-fit' | null;
type Viewer = {
  currentScaleValue: string; currentScale: number; currentPageNumber: number; pagesCount: number;
  nextPage(): boolean; previousPage(): boolean; increaseScale(): void; decreaseScale(): void;
  setDocument(d: unknown): void; cleanup?: () => void;
};

export default function PdfViewer({
  url, title, subtitle, onClose, onDownload,
}: { url: string; title: string; subtitle?: string; onClose: () => void; onDownload: () => void }) {
  const shell = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const fit = useRef<FitMode>('page-width');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [mode, setMode] = useState<FitMode>('page-width');
  const [full, setFull] = useState(false);
  const [pageInput, setPageInput] = useState('1');

  // PDF.js жүктеу және viewer құру
  useEffect(() => {
    let cancelled = false;
    let loading: { destroy(): Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
        (globalThis as unknown as { pdfjsLib: unknown }).pdfjsLib = pdfjs;
        const { EventBus, PDFLinkService, PDFViewer } = await import('pdfjs-dist/legacy/web/pdf_viewer.mjs');
        if (cancelled || !container.current || !inner.current) return;
        const eventBus = new EventBus();
        const linkService = new PDFLinkService({ eventBus });
        const v = new PDFViewer({
          container: container.current, viewer: inner.current, eventBus, linkService,
          removePageBorders: true, textLayerMode: 1,
        }) as unknown as Viewer;
        (linkService as unknown as { setViewer(v: unknown): void }).setViewer(v);
        viewer.current = v;
        eventBus.on('pagesinit', () => {
          v.currentScaleValue = 'page-width';
          setPages(v.pagesCount);
          setState('ready');
        });
        eventBus.on('pagechanging', (e: { pageNumber: number }) => { setPage(e.pageNumber); setPageInput(String(e.pageNumber)); });
        eventBus.on('scalechanging', (e: { scale: number; presetValue?: string }) => {
          setScale(e.scale);
          const m = e.presetValue === 'page-width' || e.presetValue === 'page-fit' ? e.presetValue : null;
          fit.current = m; setMode(m);
        });
        const task = pdfjs.getDocument({ url });
        loading = task;
        const pdf = await task.promise;
        if (cancelled) return;
        v.setDocument(pdf);
        (linkService as unknown as { setDocument(d: unknown, b: null): void }).setDocument(pdf, null);
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; loading?.destroy(); viewer.current = null; };
  }, [url]);

  // Экран өлшемі өзгергенде (бұру, толық экран) — таңдалған режимді қайта қолданамыз
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (viewer.current && fit.current) viewer.current.currentScaleValue = fit.current; });
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  const toggleFull = useCallback(async () => {
    const el = shell.current;
    if (!el) return;
    if (!full) {
      setFull(true);
      try { if (el.requestFullscreen && !document.fullscreenElement) await el.requestFullscreen(); } catch { /* iOS: CSS толық экран жеткілікті */ }
    } else {
      setFull(false);
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* */ }
    }
  }, [full]);

  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Пернетақта: Esc — жабу, ←/→ — беттер, +/- — масштаб
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = viewer.current;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!document.fullscreenElement) onClose(); return; }
      if (!v || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); v.nextPage(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); v.previousPage(); }
      else if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); v.increaseScale(); }
      else if (e.key === '-' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); v.decreaseScale(); }
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev; };
  }, [onClose]);

  const setFit = (m: 'page-width' | 'page-fit') => { if (viewer.current) viewer.current.currentScaleValue = m; };
  const goTo = (n: number) => {
    const v = viewer.current;
    if (!v || !pages) return;
    const p = Math.min(pages, Math.max(1, Math.round(n)));
    v.currentPageNumber = p; setPageInput(String(p));
  };

  const btn = 'flex size-9 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-mist disabled:opacity-35';
  const ready = state === 'ready';

  // Модаль ішінен ашылса да толық экранды алу үшін body-ге шығарамыз (backdrop-filter fixed-ті шектейді)
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/45 sm:p-4" role="dialog" aria-modal="true" aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={shell} data-testid="pdf-viewer"
        className={clsx('animate-sheet-in flex w-full flex-col overflow-hidden bg-white',
          full ? 'fixed inset-0 z-[95] rounded-none' : 'sm:max-w-5xl sm:rounded-[28px] sm:shadow-lift')}>
        {/* Жоғарғы жолақ */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink" title={title}>{title}</p>
            {subtitle && <p className="truncate text-[11px] text-muted">{subtitle}</p>}
          </div>
          <button type="button" className={clsx(btn, 'hidden sm:flex')} onClick={onDownload} aria-label="Жүктеп алу" title="Жүктеп алу"><Download className="size-4" /></button>
          <button type="button" className={btn} onClick={toggleFull} aria-label={full ? 'Толық экраннан шығу' : 'Толық экран'} title={full ? 'Толық экраннан шығу' : 'Толық экран'} data-testid="pdf-fullscreen">
            {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button type="button" className={btn} onClick={onClose} aria-label="Жабу" title="Жабу"><X className="size-5" /></button>
        </div>

        {/* Құжат */}
        <div className="relative min-h-0 flex-1 bg-mist">
          <div ref={container} className="absolute inset-0 overflow-auto overscroll-contain" data-testid="pdf-scroll">
            <div ref={inner} className="pdfViewer py-3" />
          </div>
          {state !== 'ready' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted">
              {state === 'loading' ? <><Spinner /> Құжат жүктелуде…</> : (
                <>
                  <p className="font-semibold text-bad">Құжатты ашу мүмкін болмады.</p>
                  <button type="button" onClick={onDownload} className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-900 px-5 text-sm font-semibold text-white">
                    <Download className="size-4" /> Жүктеп алу
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Басқару панелі */}
        <div className="safe-bottom flex flex-wrap items-center justify-center gap-x-1 gap-y-1 border-t border-line px-2 py-1.5 sm:justify-between sm:px-4">
          <div className="flex items-center gap-1">
            <button type="button" className={btn} onClick={() => viewer.current?.previousPage()} disabled={!ready || page <= 1} aria-label="Алдыңғы бет"><ChevronLeft className="size-5" /></button>
            <form className="flex items-center gap-1 text-sm" onSubmit={(e) => { e.preventDefault(); goTo(Number(pageInput)); }}>
              <input value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))} onBlur={() => goTo(Number(pageInput) || page)}
                inputMode="numeric" aria-label="Бет нөмірі" disabled={!ready} data-testid="pdf-page-input"
                className="h-9 w-11 rounded-xl border border-line bg-white text-center text-sm font-semibold outline-none focus:border-brand-500" />
              <span className="whitespace-nowrap text-muted" data-testid="pdf-page-count">/ {pages || '–'}</span>
            </form>
            <button type="button" className={btn} onClick={() => viewer.current?.nextPage()} disabled={!ready || page >= pages} aria-label="Келесі бет"><ChevronRight className="size-5" /></button>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className={btn} onClick={() => viewer.current?.decreaseScale()} disabled={!ready} aria-label="Кішірейту" title="Кішірейту"><ZoomOut className="size-4" /></button>
            <span className="w-12 text-center text-xs font-semibold text-ink tabular-nums" data-testid="pdf-zoom">{Math.round(scale * 100)}%</span>
            <button type="button" className={btn} onClick={() => viewer.current?.increaseScale()} disabled={!ready} aria-label="Үлкейту" title="Үлкейту"><ZoomIn className="size-4" /></button>
            <span className="mx-1 h-5 w-px bg-line" />
            <button type="button" onClick={() => setFit('page-width')} disabled={!ready} aria-pressed={mode === 'page-width'} title="Экран еніне сәйкестендіру"
              className={clsx('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition disabled:opacity-35', mode === 'page-width' ? 'bg-brand-900 text-white' : 'text-ink hover:bg-mist')} data-testid="pdf-fit-width">
              <MoveHorizontal className="size-4" /><span className="hidden sm:inline">Ені бойынша</span>
            </button>
            <button type="button" onClick={() => setFit('page-fit')} disabled={!ready} aria-pressed={mode === 'page-fit'} title="Толық бетті сыйдыру"
              className={clsx('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition disabled:opacity-35', mode === 'page-fit' ? 'bg-brand-900 text-white' : 'text-ink hover:bg-mist')} data-testid="pdf-fit-page">
              <Expand className="size-4" /><span className="hidden sm:inline">Толық бет</span>
            </button>
            <button type="button" className={clsx(btn, 'sm:hidden')} onClick={onDownload} aria-label="Жүктеп алу"><Download className="size-4" /></button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
