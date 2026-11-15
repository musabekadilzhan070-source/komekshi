'use client';
import { supabaseBrowser } from './supabase/client';

export const TASK_BUCKET = 'task-files';
export const MAX_TASK_FILE_MB = 50;

export const TASK_FILE_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'image/jpeg': 'Сурет',
  'image/png': 'Сурет',
  'image/webp': 'Сурет',
  'text/plain': 'Мәтін',
};

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', txt: 'text/plain',
};

export const TASK_FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt';
export const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp';

/** Браузер кейде MIME типін бермейді — кеңейтуден анықтаймыз */
export function fileMime(file: File): string {
  if (file.type && TASK_FILE_TYPES[file.type]) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? file.type ?? '';
}

export function fileKindLabel(mime: string): string {
  return TASK_FILE_TYPES[mime] ?? 'Файл';
}

export function isImage(mime: string) { return mime.startsWith('image/'); }
export function isPdf(mime: string) { return mime === 'application/pdf'; }

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.0', '')} МБ`;
}

/** Файл атауын storage жолына қауіпсіз түрге келтіру (қазақ әріптері атауда сақталады) */
export function safeName(name: string): string {
  const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  return `${crypto.randomUUID().slice(0, 8)}${ext}`;
}

export function validateTaskFile(file: File, maxMb = MAX_TASK_FILE_MB): string | null {
  const mime = fileMime(file);
  if (!TASK_FILE_TYPES[mime]) return `«${file.name}»: бұл форматқа рұқсат жоқ (PDF, Word, PowerPoint, Excel, JPG, PNG).`;
  if (file.size > maxMb * 1024 * 1024) return `«${file.name}»: көлемі ${maxMb} МБ-тан аспауы керек.`;
  if (file.size === 0) return `«${file.name}»: файл бос.`;
  return null;
}

export function uploadWithProgress(signedUrl: string, file: File, contentType: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded * 100) / e.total));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || `HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(file);
  });
}

/** Файлды task-files бакетіне жүктеу: жолы {uid}/{folder}/{safe-name} */
export async function uploadTaskFile(uid: string, folder: string, file: File, onProgress: (p: number) => void) {
  const sb = supabaseBrowser();
  const mime = fileMime(file);
  const path = `${uid}/${folder}/${safeName(file.name)}`;
  const signed = await sb.storage.from(TASK_BUCKET).createSignedUploadUrl(path);
  if (signed.error) throw signed.error;
  await uploadWithProgress(signed.data.signedUrl, file, mime, onProgress);
  return { storage_path: path, file_name: file.name.slice(0, 255), mime_type: mime, size_bytes: file.size };
}

export async function signedFileUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabaseBrowser().storage.from(TASK_BUCKET)
    .createSignedUrl(path, 60 * 30, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeTaskFiles(paths: string[]) {
  if (paths.length) await supabaseBrowser().storage.from(TASK_BUCKET).remove(paths);
}
