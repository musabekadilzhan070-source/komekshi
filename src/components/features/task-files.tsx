'use client';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Download, Eye, FileImage, FileSpreadsheet, FileText, FileType2, Paperclip, Presentation, Trash2, UploadCloud, X } from 'lucide-react';
import {
  fileKindLabel, formatSize, isImage, isPdf, MAX_TASK_FILE_MB, signedFileUrl, TASK_FILE_ACCEPT, uploadTaskFile, validateTaskFile,
} from '@/lib/files';
import { humanError } from '@/lib/errors';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';

export interface FileMeta { id?: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number }

function FileIcon({ mime, className }: { mime: string; className?: string }) {
  const kind = fileKindLabel(mime);
  const Icon = kind === 'PDF' ? FileType2 : kind === 'Сурет' ? FileImage : kind === 'Excel' ? FileSpreadsheet : kind === 'PowerPoint' ? Presentation : FileText;
  return <Icon className={className} />;
}

type Pending = { id: string; name: string; progress: number; error?: string };

/** Бірнеше файлды жүктеу (прогрестермен) */
export function FileUploader({
  uid, folder, onUploaded, disabled, maxMb = MAX_TASK_FILE_MB, accept = TASK_FILE_ACCEPT, label = 'Файл тіркеу', hint, onBusyChange,
}: {
  uid: string; folder: string; onUploaded: (f: FileMeta) => void | Promise<void>; disabled?: boolean; maxMb?: number;
  accept?: string; label?: string; hint?: string; onBusyChange?: (busy: boolean) => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = pending.some((p) => !p.error);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  const handle = async (files: FileList | File[] | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      const err = validateTaskFile(file, maxMb);
      if (err) {
        setPending((p) => [...p, { id, name: file.name, progress: 0, error: err }]);
        continue;
      }
      setPending((p) => [...p, { id, name: file.name, progress: 0 }]);
      try {
        const meta = await uploadTaskFile(uid, folder, file, (progress) =>
          setPending((p) => p.map((x) => (x.id === id ? { ...x, progress } : x))));
        await onUploaded(meta);
        setPending((p) => p.filter((x) => x.id !== id));
      } catch (e) {
        setPending((p) => p.map((x) => (x.id === id ? { ...x, error: `«${file.name}»: ${humanError(e)}` } : x)));
      }
    }
    if (input.current) input.current.value = '';
  };

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) handle(e.dataTransfer.files); }}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors',
          drag ? 'border-navy-700 bg-navy-50' : 'border-sand-300 bg-white/70 hover:border-navy-300',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <input ref={input} type="file" multiple accept={accept} className="sr-only" disabled={disabled} onChange={(e) => handle(e.target.files)} />
        <UploadCloud className="size-6 text-navy-700" />
        <span className="text-sm font-bold text-navy-900">{label}</span>
        <span className="text-xs text-muted">{hint ?? `PDF, Word, PowerPoint, Excel, JPG, PNG · әрқайсысы ${maxMb} МБ-қа дейін`}</span>
      </label>
      {pending.map((p) => (
        <div key={p.id} className={clsx('rounded-2xl px-3 py-2.5 text-xs', p.error ? 'bg-bad-soft text-bad' : 'bg-white ring-1 ring-line')}>
          {p.error ? (
            <div className="flex items-start justify-between gap-2">
              <span role="alert">{p.error}</span>
              <button type="button" aria-label="Жабу" onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))}><X className="size-4" /></button>
            </div>
          ) : (
            <>
              <div className="mb-1.5 flex justify-between gap-2 font-semibold text-navy-900">
                <span className="truncate">{p.name}</span><span>{p.progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-navy-100">
                <div className="h-full rounded-full bg-navy-900 transition-[width]" style={{ width: `${p.progress}%` }} />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Тіркелген файлдар тізімі: көру (PDF/сурет сайт ішінде), жүктеп алу, өшіру */
export function FileList({
  files, onRemove, emptyText, compact,
}: { files: FileMeta[]; onRemove?: (f: FileMeta) => void; emptyText?: string; compact?: boolean }) {
  const toast = useToast();
  const [preview, setPreview] = useState<FileMeta | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (f: FileMeta) => {
    setBusy(f.storage_path);
    try {
      const url = await signedFileUrl(f.storage_path, f.file_name);
      const a = document.createElement('a');
      a.href = url; a.rel = 'noopener'; a.click();
    } catch (e) { toast.error(humanError(e)); }
    setBusy(null);
  };

  if (!files.length) return emptyText ? <p className="text-sm text-muted">{emptyText}</p> : null;
  return (
    <>
      <ul className={clsx('grid gap-2', !compact && 'sm:grid-cols-2')}>
        {files.map((f) => {
          const viewable = isPdf(f.mime_type) || isImage(f.mime_type);
          return (
            <li key={f.storage_path} className="flex min-w-0 items-center gap-3 rounded-2xl bg-white p-2.5 ring-1 ring-line">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-mist">
                <FileIcon mime={f.mime_type} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-navy-900" title={f.file_name}>{f.file_name}</span>
                <span className="block text-[11px] text-muted">{fileKindLabel(f.mime_type)} · {formatSize(f.size_bytes)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {viewable && (
                  <button type="button" onClick={() => setPreview(f)} aria-label={`${f.file_name} ашу`} title="Ашу"
                    className="flex size-9 items-center justify-center rounded-full text-navy-900 hover:bg-navy-50"><Eye className="size-4" /></button>
                )}
                <button type="button" onClick={() => download(f)} aria-label={`${f.file_name} жүктеп алу`} title="Жүктеп алу"
                  className="flex size-9 items-center justify-center rounded-full text-navy-900 hover:bg-navy-50">
                  {busy === f.storage_path ? <Spinner className="size-4" /> : <Download className="size-4" />}
                </button>
                {onRemove && (
                  <button type="button" onClick={() => onRemove(f)} aria-label={`${f.file_name} өшіру`} title="Өшіру"
                    className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-bad-soft hover:text-bad"><Trash2 className="size-4" /></button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} onDownload={() => download(preview)} />}
    </>
  );
}

function FilePreview({ file, onClose, onDownload }: { file: FileMeta; onClose: () => void; onDownload: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    signedFileUrl(file.storage_path).then(setUrl).catch((e) => setErr(humanError(e)));
  }, [file.storage_path]);
  return (
    <Modal open onClose={onClose} size="xl" title={file.file_name} subtitle={`${fileKindLabel(file.mime_type)} · ${formatSize(file.size_bytes)}`}
      footer={<button type="button" onClick={onDownload} className="inline-flex h-11 items-center gap-2 rounded-full bg-navy-900 px-6 text-sm font-semibold text-white"><Download className="size-4" /> Жүктеп алу</button>}>
      {err ? <p className="text-sm text-bad">{err}</p> : !url ? (
        <div className="flex h-64 items-center justify-center"><Spinner /></div>
      ) : isPdf(file.mime_type) ? (
        <iframe src={url} title={file.file_name} className="h-[70dvh] w-full rounded-2xl bg-white ring-1 ring-line" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.file_name} className="mx-auto max-h-[70dvh] rounded-2xl object-contain" />
      )}
    </Modal>
  );
}

/** Жабық бакеттегі суретті көрсету (тест сұрақтары үшін) */
export function SignedImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    signedFileUrl(path).then((u) => on && setUrl(u)).catch(() => undefined);
    return () => { on = false; };
  }, [path]);
  if (!url) return <div className={clsx('skeleton rounded-2xl', className)} style={{ minHeight: 140 }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={clsx('rounded-2xl object-contain', className)} />;
}

export function AttachmentCount({ n }: { n: number }) {
  if (!n) return null;
  return <span className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2.5 py-1 text-[11px] font-semibold text-navy-900"><Paperclip className="size-3" /> {n} файл</span>;
}
