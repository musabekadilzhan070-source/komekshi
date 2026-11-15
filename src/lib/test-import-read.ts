'use client';
/**
 * Импорт файлын браузерде оқу: DOCX (mammoth), XLSX (read-excel-file), CSV (papaparse), PDF (pdf.js).
 * Файл серверге жіберілмейді — тек куратордың браузерінде талданады.
 * Кітапханалар тек импорт кезінде жүктеледі (dynamic import), сайттың негізгі бумасы ауырламайды.
 */
import { parseLines, parseRows, TEMPLATE_HEADER, TEMPLATE_ROWS, type ImportLine, type ImportResult } from './test-import';

export const IMPORT_ACCEPT = '.docx,.xlsx,.csv,.pdf';
export const IMPORT_MAX_MB = 20;

export async function readImportFile(file: File): Promise<ImportResult> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (file.size > IMPORT_MAX_MB * 1024 * 1024) throw new Error(`Файл көлемі ${IMPORT_MAX_MB} МБ-тан аспауы керек.`);
  if (ext === 'doc' || ext === 'xls') throw new Error('Ескі формат. Файлды DOCX немесе XLSX ретінде сақтап, қайта жүктеңіз.');
  switch (ext) {
    case 'csv': return parseRows(await readCsv(file));
    case 'xlsx': return parseRows(await readXlsx(file));
    case 'docx': return readDocx(file);
    case 'pdf': return readPdf(file);
    default: throw new Error('Тек DOCX, XLSX, CSV немесе PDF файлын жүктеңіз.');
  }
}

/* ---------- CSV ---------- */
async function readCsv(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { text = new TextDecoder('windows-1251').decode(buf); } // Excel-дің ескі кириллица CSV-і
  const Papa = (await import('papaparse')).default;
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  return res.data;
}

/* ---------- XLSX ---------- */
async function readXlsx(file: File): Promise<unknown[][]> {
  const { readSheet } = await import('read-excel-file/browser');
  const rows = await readSheet(file);
  return rows as unknown[][];
}

/* ---------- DOCX ---------- */
async function readDocx(file: File): Promise<ImportResult> {
  const mammoth = (await import('mammoth')).default;
  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      convertImage: mammoth.images.imgElement(async (img) => ({ src: `data:${img.contentType};base64,${await img.read('base64')}` })),
    },
  );
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  // Құжатта сұрақтар кестесі болса — кестелік форматпен оқимыз
  for (const table of doc.querySelectorAll('table')) {
    const rows: string[][] = [];
    const images: Record<number, string[]> = {};
    table.querySelectorAll('tr').forEach((tr, i) => {
      rows.push([...tr.querySelectorAll('td,th')].map((c) => c.textContent ?? ''));
      const imgs = [...tr.querySelectorAll('img')].map((x) => x.getAttribute('src') ?? '').filter((s) => s.startsWith('data:image/'));
      if (imgs.length) images[i] = imgs;
    });
    const r = parseRows(rows, images);
    if (!r.fatal) return r;
  }

  const lines: ImportLine[] = [];
  const walk = (el: Element, level: number) => {
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'ol' || tag === 'ul') { walk(child, level + 1); continue; }
      if (tag === 'table') continue;
      if (tag === 'li' || tag === 'p' || /^h[1-6]$/.test(tag)) {
        // тізім элементінің ішіндегі ішкі тізімді бөлек өңдейміз
        const clone = child.cloneNode(true) as Element;
        clone.querySelectorAll('ol,ul').forEach((x) => x.remove());
        const text = clone.textContent ?? '';
        const strong = [...clone.querySelectorAll('strong,b')].map((x) => x.textContent ?? '').join('').trim();
        const images = [...clone.querySelectorAll('img')].map((x) => x.getAttribute('src') ?? '').filter((s) => s.startsWith('data:image/'));
        // Жолдың ішіндегі қатар үзілімдері (Shift+Enter) — бөлек жол
        const parts = text.split(/\n+/);
        const LABEL = /^([*+✓✔]\s*)?[A-Za-zА-ЯЁа-яёӘәҒғҚқҢңӨөҰұҮүҺһІі]\s*[).]\s*/u;
        const boldBody = strong.replace(LABEL, '').trim();
        parts.forEach((t, i) => {
          const body = t.trim().replace(LABEL, '').trim();
          lines.push({
            text: t, level: tag === 'li' ? level : 0, images: i === 0 ? images : [],
            // нұсқаның өз мәтіні (әріпсіз) толығымен қалың болса — дұрыс жауап белгісі ретінде қарастырылады
            bold: body.length > 0 && boldBody.length >= body.length * 0.9,
          });
        });
        child.querySelectorAll(':scope > ol, :scope > ul').forEach((x) => walk(x, level + 1));
        continue;
      }
      walk(child, level);
    }
  };
  walk(doc.body, 0);
  return parseLines(lines);
}

/* ---------- PDF (тек мәтін; суреттер оқылмайды) ---------- */
async function readPdf(file: File): Promise<ImportResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: ImportLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Бір жолдағы мәтін бөліктерін y координатасы бойынша топтастырамыз
    const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const x = it.transform[4]; const y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y).forEach((r) => {
      lines.push({ text: r.parts.sort((a, b) => a.x - b.x).map((x) => x.s).join(' '), level: 0, bold: false, images: [] });
    });
  }
  const res = parseLines(lines);
  if (!res.fatal && res.questions.some((q) => q.draft.qtype === 'image')) {
    res.questions.forEach((q) => { if (q.draft.qtype === 'image') q.issues.push('PDF-тен суреттер оқылмайды — суретті қолмен тіркеңіз.'); });
  }
  return res;
}

/* ---------- Үлгі ---------- */
export function downloadCsvTemplate() {
  const esc = (s: string) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const csv = '﻿' + [TEMPLATE_HEADER, ...TEMPLATE_ROWS].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'komekshi-test-ulgi.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** data: URL → File (импортталған суретті жабық бакетке жүктеу үшін) */
export function dataUrlToFile(dataUrl: string, name: string): File | null {
  const m = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/);
  if (!m) return null;
  const mime = m[1] === 'image/jpg' ? 'image/jpeg' : m[1];
  if (mime === 'image/gif') return null;
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  return new File([bytes], `${name}.${ext}`, { type: mime });
}
