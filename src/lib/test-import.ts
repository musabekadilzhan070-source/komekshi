/**
 * Тестті файлдан импорттау: файлдан оқылған мәтінді/кестені тест редакторының
 * сұрақтарына (QuestionDraft) айналдыру. Бұл модуль тек таза функциялардан тұрады
 * (браузерге тәуелсіз), сондықтан оны Node-та да тексеруге болады.
 *
 * Негізгі қағида: құрылымы түсініксіз жерде болжам жасамаймыз. Дұрыс жауабы
 * анықталмаған немесе толық оқылмаған сұрақ «түзету қажет» деп белгіленеді,
 * ал ешбір сұраққа жатпайтын жолдар жеке тізімде көрсетіледі.
 */
import type { Opt, QuestionDraft, QuestionType } from './types';

export type ImportLine = { text: string; level: number; bold: boolean; images: string[] };

export interface ImportedQuestion {
  draft: QuestionDraft;
  /** data: URL түріндегі суреттер (импорт кезінде жабық бакетке жүктеледі) */
  images: string[];
  issues: string[];
  /** Файлдағы орны: «3-жол» / «5-сұрақ» */
  source: string;
}

export interface ImportResult {
  format: 'table' | 'text';
  questions: ImportedQuestion[];
  /** Ешбір сұраққа жатқызылмаған жолдар */
  unread: string[];
  /** Бүкіл файлға қатысты қате (құрылым мүлдем танылмаса) */
  fatal?: string;
}

const MAX_OPTIONS = 10;
const MAX_LEFT = 10;
const MAX_RIGHT = 12;

let seq = 0;
const rid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const opt = (text: string): Opt => ({ id: rid(), text: text.trim().slice(0, 1000) });
const clean = (s: string) => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

/* ---------------- Әріптер мен түрлер ---------------- */

// Кирилл мен латын әріптері сырттай бірдей (А/A, В/B, С/C, Е/E...) — салыстыру үшін бір түрге келтіреміз
const LOOKALIKE: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X',
};
export const normLabel = (s: string) => {
  const u = s.trim().toUpperCase();
  return u.length === 1 ? (LOOKALIKE[u] ?? u) : u;
};
const LATIN = 'ABCDEFGHIJKL';

const TYPE_ALIASES: [RegExp, QuestionType][] = [
  [/^(бір\s*жауапты|бір\s*дұрыс|single|один|1)$/i, 'single'],
  [/^(бірнеше\s*жауапты|бірнеше\s*дұрыс|көп\s*жауапты|multiple|multi|несколько|2)$/i, 'multiple'],
  [/^(сәйкестендіру|сәйкестік|matching|match|соответствие)$/i, 'matching'],
  [/^(реттеу|хронология|хронологиялық|хронологиялық\s*реттеу|ordering|order|последовательность|хронология)$/i, 'ordering'],
  [/^(мәтін|мәтінге\s*негізделген|контекст|context|text)$/i, 'context'],
  [/^(сурет|суретке\s*негізделген|image|картинка)$/i, 'image'],
];
export function parseType(s: string | null | undefined): QuestionType | null {
  const v = clean(String(s ?? '')).replace(/[.:]$/, '');
  if (!v) return null;
  for (const [re, t] of TYPE_ALIASES) if (re.test(v)) return t;
  return null;
}

/* ---------------- Сұрақ жинағыш ---------------- */

type Raw = {
  source: string;
  prompt: string[];
  hint: QuestionType | null;
  context: string;
  options: { label: string; text: string; marked: boolean; bold: boolean }[];
  left: { label: string; text: string }[];
  pairs: { left: string; right: string }[];
  answer: string | null;
  explanation: string;
  points: number | null;
  images: string[];
  issues: string[];
};

const newRaw = (source: string): Raw => ({
  source, prompt: [], hint: null, context: '', options: [], left: [], pairs: [], answer: null,
  explanation: '', points: null, images: [], issues: [],
});

// Дұрыс нұсқаның белгілері: «*А) ...», «+ ...», «... *», «... (дұрыс)», «... ✓»
const MARK_PREFIX = /^\s*[*+✓✔]\s*/u;
const MARK_SUFFIX = /\s*(\*|✓|✔|\((дұрыс|верно|правильно|correct)\))\s*$/iu;
function stripMark(s: string) {
  let marked = false;
  let t = s;
  if (MARK_PREFIX.test(t)) { marked = true; t = t.replace(MARK_PREFIX, ''); }
  if (MARK_SUFFIX.test(t)) { marked = true; t = t.replace(MARK_SUFFIX, ''); }
  return { text: t.trim(), marked };
}

const PAIR_SEP = /\s+(?:—|–|-|=|→|->|=>)\s+/u;
function splitPair(s: string): { left: string; right: string } | null {
  const m = s.split(PAIR_SEP);
  if (m.length !== 2) return null;
  const [l, r] = m.map((x) => x.trim());
  return l && r ? { left: l, right: r } : null;
}

const KEYWORD_MATCHING = /сәйкестендір|сәйкестігін|сәйкес\s*келтір|соотнесите|установите\s*соответствие/i;
const KEYWORD_ORDERING = /ретімен|хронологиялық|ретін\s*анықта|ретпен\s*орналастыр|последовательност|хронологическ/i;

/** Жауап жолын талдау: «B», «A, C», «1-B, 2-A», «B A C» */
function answerTokens(s: string) {
  return s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
}

function finalize(r: Raw): ImportedQuestion {
  const issues = [...r.issues];
  const prompt = clean(r.prompt.join('\n').replace(/\n{2,}/g, '\n'));
  const d: QuestionDraft = {
    key: rid(), qtype: 'single', prompt: prompt.slice(0, 4000), context_text: r.context.slice(0, 12000), image_path: null,
    options: [], left: [], right: [], correct: [], pairs: {}, explanation: r.explanation.slice(0, 4000),
    points: r.points && r.points > 0 && r.points <= 100 ? r.points : 1,
  };
  if (!prompt) issues.push('Сұрақ мәтіні табылмады.');
  if (r.points != null && !(r.points > 0 && r.points <= 100)) issues.push('Ұпай 1–100 аралығында болуы керек, 1 деп алынды.');

  // ---- Түрін анықтау ----
  let qtype: QuestionType;
  if (r.hint) qtype = r.hint;
  else if (r.pairs.length || r.left.length) qtype = 'matching';
  else if (KEYWORD_ORDERING.test(prompt) && !r.options.some((o) => o.marked)) qtype = 'ordering';
  else if (r.context) qtype = 'context';
  else qtype = 'single';
  if (qtype === 'single' && r.images.length) qtype = 'image';
  if (qtype === 'matching' && !r.pairs.length && !r.left.length) {
    // «сәйкестендіру» деп жазылған, бірақ жұптары жоқ
    issues.push('Сәйкестендіру жұптары табылмады. Сол және оң жақ бағандарды толтырыңыз.');
  }
  if (qtype === 'context' && !r.context) issues.push('Оқылатын мәтін табылмады («Мәтін:» деп бастаңыз).');

  // ---- Сәйкестендіру ----
  if (qtype === 'matching') {
    d.qtype = 'matching';
    if (r.pairs.length) {
      const left = r.pairs.map((p) => opt(p.left));
      const right = r.pairs.map((p) => opt(p.right));
      // оң жақтағы артық нұсқалар (дистракторлар)
      r.options.forEach((o) => { if (!r.pairs.some((p) => p.right === o.text)) right.push(opt(o.text)); });
      d.left = left; d.right = right;
      d.pairs = Object.fromEntries(left.map((l, i) => [l.id, right[i].id]));
    } else if (r.left.length) {
      d.left = r.left.map((l) => opt(l.text));
      d.right = r.options.map((o) => opt(o.text));
      if (!r.answer) issues.push('Сәйкестік көрсетілмеген (мысалы, «Жауабы: 1-B, 2-A»).');
      else {
        for (const tok of r.answer.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
          const m = tok.match(/^(\S+?)\s*[-–—:=→)]\s*(\S+)$/u);
          if (!m) { issues.push(`Жауаптағы «${tok}» бөлігі түсініксіз.`); continue; }
          const li = r.left.findIndex((l) => normLabel(l.label) === normLabel(m[1]));
          const ri = r.options.findIndex((o) => normLabel(o.label) === normLabel(m[2]));
          if (li < 0 || ri < 0) { issues.push(`Жауаптағы «${tok}» жұбы нұсқалар ішінде жоқ.`); continue; }
          d.pairs[d.left[li].id] = d.right[ri].id;
        }
        if (Object.keys(d.pairs).length !== d.left.length) issues.push('Барлық сол жақ элементтерге сәйкес жауап көрсетілмеген.');
      }
    }
    if (d.left.length < 2) issues.push('Кемінде екі жұп керек.');
    if (d.left.length > MAX_LEFT || d.right.length > MAX_RIGHT) issues.push(`Сәйкестендіруде ең көбі ${MAX_LEFT} жұп болады.`);
    return { draft: d, images: r.images, issues: dedupe(issues), source: r.source };
  }

  // ---- Нұсқалар ----
  const opts = r.options.map((o) => ({ ...o, opt: opt(o.text) }));
  d.options = opts.map((o) => o.opt);
  if (opts.length < 2) issues.push('Кемінде екі жауап нұсқасы керек.');
  if (opts.length > MAX_OPTIONS) issues.push(`Нұсқалар саны ${MAX_OPTIONS}-нан аспауы керек.`);
  const byLabel = (lab: string) => {
    const n = normLabel(lab);
    let i = opts.findIndex((o) => normLabel(o.label) === n);
    if (i < 0 && /^\d+$/.test(n)) i = Number(n) - 1; // «1, 3» — нұсқа нөмірі
    return i >= 0 && i < opts.length ? i : -1;
  };

  // ---- Хронологиялық реттеу ----
  if (qtype === 'ordering') {
    d.qtype = 'ordering';
    if (r.answer) {
      const toks = answerTokens(r.answer);
      const idx = toks.map(byLabel);
      if (idx.some((i) => i < 0)) issues.push(`Жауаптағы рет («${r.answer}») нұсқалармен сәйкес келмейді.`);
      else if (new Set(idx).size !== opts.length) issues.push('Жауапта барлық нұсқалар бір реттен көрсетілуі керек.');
      else d.options = idx.map((i) => opts[i].opt);
    } else if (!r.hint) {
      issues.push('Дұрыс рет көрсетілмеген («Жауабы: B, A, C» деп жазыңыз немесе «Түрі: реттеу» деп белгілеп, нұсқаларды дұрыс ретпен беріңіз).');
    }
    // «Түрі: реттеу» болса — нұсқалар файлда дұрыс ретпен берілген деп есептеледі (үлгіде осылай сипатталған)
    return { draft: d, images: r.images, issues: dedupe(issues), source: r.source };
  }

  // ---- Бір/бірнеше жауапты ----
  let correct: number[] = [];
  const marked = opts.map((o, i) => (o.marked ? i : -1)).filter((i) => i >= 0);
  if (r.answer) {
    const toks = answerTokens(r.answer);
    const idx = toks.map(byLabel);
    if (idx.some((i) => i < 0)) {
      // жауап нұсқаның өз мәтінімен жазылған болуы мүмкін
      const exact = opts.findIndex((o) => o.text.toLowerCase() === clean(r.answer!).toLowerCase());
      if (exact >= 0) correct = [exact];
      else issues.push(`Жауап «${r.answer}» нұсқалар ішінде табылмады.`);
    } else correct = [...new Set(idx)];
    if (marked.length && correct.length && marked.join() !== [...correct].sort((a, b) => a - b).join()) {
      issues.push('Нұсқадағы белгі мен «Жауабы» жолы сәйкес келмейді — тексеріңіз.');
    }
  } else if (marked.length) {
    correct = marked;
  } else {
    const bold = opts.map((o, i) => (o.bold ? i : -1)).filter((i) => i >= 0);
    if (bold.length && bold.length < opts.length) correct = bold;
  }
  if (!correct.length && opts.length >= 2) issues.push('Дұрыс жауап анықталмады. Белгілеп беріңіз.');

  if (qtype === 'multiple' || (correct.length > 1 && !r.hint)) d.qtype = 'multiple';
  else d.qtype = qtype;
  if (correct.length > 1 && r.hint && r.hint !== 'multiple') {
    issues.push('Бір жауапты сұрақта бірнеше дұрыс жауап көрсетілген.');
  }
  d.correct = correct.map((i) => opts[i].opt.id);
  if (d.qtype === 'image' && !r.images.length) issues.push('Суретке негізделген сұраққа сурет табылмады — қолмен тіркеңіз.');
  return { draft: d, images: r.images, issues: dedupe(issues), source: r.source };
}

const dedupe = (a: string[]) => [...new Set(a)];

/* =====================================================================
 * 1) Мәтіндік формат (DOCX, PDF)
 * ===================================================================== */

const Q_START = /^\s*(?:(?:сұрақ|вопрос|question)\s*)?(\d{1,3})\s*[.)]\s*(.*)$/iu;
const Q_START_WORD = /^\s*(?:(\d{1,3})\s*-?\s*сұрақ|сұрақ\s*(\d{1,3}))\s*[:.)]?\s*(.*)$/iu;
const OPT = /^\s*([*+✓✔]\s*)?([A-Za-zА-ЯЁа-яёӘәҒғҚқҢңӨөҰұҮүҺһІі])\s*[).]\s*(.+)$/u;
const ANSWER = /^\s*(?:дұрыс\s*жауап(?:ы)?|жауабы|жауап|кілт|answer|ответ|правильный\s*ответ)\s*[:\-–—]\s*(.+)$/iu;
const TYPE = /^\s*(?:түрі|сұрақ\s*түрі|тип|type)\s*[:\-–—]\s*(.+)$/iu;
const CONTEXT = /^\s*(?:мәтін|мәтінді\s*оқыңыз|текст|context)\s*[:\-–—]\s*(.*)$/iu;
const EXPL = /^\s*(?:түсіндірме|түсініктеме|пояснение|explanation)\s*[:\-–—]\s*(.+)$/iu;
const POINTS = /^\s*(?:ұпай|балл|баллы|points?)\s*[:\-–—]\s*(\d+(?:[.,]\d+)?)\s*$/iu;

export function parseLines(input: ImportLine[]): ImportResult {
  const lines = input.map((l) => ({ ...l, text: clean(l.text) })).filter((l) => l.text || l.images.length);
  const questions: ImportedQuestion[] = [];
  const unread: string[] = [];
  let cur: Raw | null = null;
  let pendingHint: QuestionType | null = null;
  let pendingContext: string | null = null;
  let pendingImages: string[] = [];
  let inContext = false;
  let n = 0;

  const close = () => { if (cur) questions.push(finalize(cur)); cur = null; };
  const start = (text: string) => {
    close();
    n++;
    cur = newRaw(`${n}-сұрақ`);
    if (text) cur.prompt.push(text);
    if (pendingHint) { cur.hint = pendingHint; pendingHint = null; }
    if (pendingContext) { cur.context = pendingContext.trim(); pendingContext = null; }
    if (pendingImages.length) { cur.images.push(...pendingImages); pendingImages = []; }
    inContext = false;
  };

  for (const line of lines) {
    const t = line.text;
    const c = cur as Raw | null;

    // Метадеректер жолдары
    let m: RegExpMatchArray | null;
    if ((m = t.match(TYPE))) {
      const ty = parseType(m[1]);
      if (!ty) { unread.push(t); continue; }
      if (c && !c.options.length && !c.left.length && !c.pairs.length) c.hint = ty; else pendingHint = ty;
      continue;
    }
    if ((m = t.match(CONTEXT))) {
      close();
      pendingContext = m[1] ? m[1] + '\n' : '';
      inContext = true;
      if (line.images.length) pendingImages.push(...line.images);
      continue;
    }
    if (c && (m = t.match(ANSWER))) { c.answer = m[1].trim(); continue; }
    if (c && (m = t.match(EXPL))) { c.explanation = m[1].trim(); continue; }
    if (c && (m = t.match(POINTS))) { c.points = Number(m[1].replace(',', '.')); continue; }

    // Сұрақтың басталуы
    const qw = t.match(Q_START_WORD);
    const qs = qw ? null : t.match(Q_START);
    if (qw || qs) {
      const num = Number(qw ? (qw[1] ?? qw[2]) : qs![1]);
      const body = (qw ? qw[3] : qs![2]).trim();
      // Сәйкестендірудің сол жақ элементтері де «1) ...» деп нөмірленеді
      const matchingCtx = c && (c.hint === 'matching' || KEYWORD_MATCHING.test(c.prompt.join(' ')))
        && !c.options.length && c.prompt.length > 0 && num === c.left.length + 1;
      if (c && matchingCtx) {
        c.left.push({ label: String(num), text: body });
        continue;
      }
      start(body);
      if (line.images.length) (cur as unknown as Raw).images.push(...line.images);
      continue;
    }

    // Авто-нөмірленген тізім (Word): 1-деңгей — сұрақ, 2-деңгей — нұсқа
    if (line.level === 1 && !OPT.test(t)) {
      const cc = c;
      const matchingList = cc && (cc.hint === 'matching' || KEYWORD_MATCHING.test(cc.prompt.join(' '))) && !cc.options.length && cc.prompt.length > 0;
      if (!matchingList) { start(t); if (line.images.length) (cur as unknown as Raw).images.push(...line.images); continue; }
    }

    if (inContext && !c) {
      pendingContext = (pendingContext ?? '') + t + '\n';
      if (line.images.length) pendingImages.push(...line.images);
      continue;
    }

    if (!c) {
      if (line.images.length) pendingImages.push(...line.images);
      if (t) unread.push(t);
      continue;
    }

    // Нұсқа
    const om = t.match(OPT);
    if (om || line.level >= 2) {
      const prefixMark = !!om?.[1];
      const label = om ? om[2] : LATIN[c.options.length] ?? String(c.options.length + 1);
      const { text, marked } = stripMark(om ? om[3] : t);
      const pair = splitPair(text);
      const isMatching = c.hint === 'matching' || KEYWORD_MATCHING.test(c.prompt.join(' '));
      if (isMatching && pair && !c.left.length) c.pairs.push(pair);
      else c.options.push({ label, text, marked: marked || prefixMark, bold: line.bold });
      if (line.images.length) c.images.push(...line.images);
      continue;
    }

    // «Абай — Қара сөздер» түріндегі жұптар
    const pair = splitPair(t);
    if (pair && (c.hint === 'matching' || KEYWORD_MATCHING.test(c.prompt.join(' '))) && !c.left.length) {
      c.pairs.push(pair);
      continue;
    }

    // Сұрақ мәтінінің жалғасы немесе сурет
    if (line.images.length) c.images.push(...line.images);
    if (!t) continue;
    if (!c.options.length && !c.left.length && !c.pairs.length) c.prompt.push(t);
    else {
      unread.push(t);
      c.issues.push(`Оқылмаған жол: «${t.slice(0, 80)}»`);
    }
  }
  close();
  if (pendingContext && !questions.length) unread.push(pendingContext.trim());
  return {
    format: 'text', questions, unread,
    fatal: questions.length ? undefined : 'Файлдан бірде-бір сұрақ табылмады. Сұрақтарды «1. Сұрақ мәтіні», нұсқаларды «A) ...» түрінде жазыңыз немесе үлгіні пайдаланыңыз.',
  };
}

/* =====================================================================
 * 2) Кестелік формат (XLSX, CSV, DOCX ішіндегі кесте)
 * ===================================================================== */

type ColMap = {
  type?: number; prompt?: number; context?: number; answer?: number; explanation?: number; points?: number;
  options: { col: number; label: string }[];
};

const H = (s: unknown) => clean(String(s ?? '')).toLowerCase().replace(/[.:*]/g, '').trim();
const HEAD = {
  type: /^(түрі|сұрақ түрі|тип|type)$/,
  prompt: /^(сұрақ|сұрақ мәтіні|вопрос|question|тапсырма)$/,
  context: /^(мәтін|оқылатын мәтін|контекст|context|текст)$/,
  answer: /^(дұрыс жауап|жауап|жауабы|кілт|answer|correct|ответ|правильный ответ)$/,
  explanation: /^(түсіндірме|түсініктеме|пояснение|explanation)$/,
  points: /^(ұпай|балл|баллы|points?)$/,
};

function mapHeader(row: unknown[]): ColMap | null {
  const m: ColMap = { options: [] };
  row.forEach((cell, i) => {
    const h = H(cell);
    if (!h) return;
    for (const k of Object.keys(HEAD) as (keyof typeof HEAD)[]) {
      if (HEAD[k].test(h) && m[k] == null) { m[k] = i; return; }
    }
    let om: RegExpMatchArray | null;
    if ((om = h.match(/^([a-zа-яәғқңөұүһі])$/u))) m.options.push({ col: i, label: om[1].toUpperCase() });
    else if ((om = h.match(/^(?:нұсқа|вариант|option)\s*([a-zа-я]|\d+)$/u))) m.options.push({ col: i, label: om[1].toUpperCase() });
  });
  return m.prompt != null && m.options.length >= 2 ? m : null;
}

export function parseRows(rows: unknown[][], images: Record<number, string[]> = {}): ImportResult {
  const unread: string[] = [];
  let hi = -1;
  let map: ColMap | null = null;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    map = mapHeader(rows[i] ?? []);
    if (map) { hi = i; break; }
  }
  if (!map) {
    return {
      format: 'table', questions: [], unread: [],
      fatal: 'Кестенің бағандары танылмады. Бірінші жолда «Сұрақ», «A», «B», ... «Дұрыс жауап» бағандары болуы керек — үлгіні жүктеп алыңыз.',
    };
  }
  const questions: ImportedQuestion[] = [];
  const cell = (r: unknown[], i?: number) => (i == null ? '' : clean(String(r[i] ?? '')));
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.every((x) => !clean(String(x ?? '')))) continue;
    const raw = newRaw(`${i + 1}-жол`);
    const prompt = cell(r, map.prompt);
    if (prompt) raw.prompt.push(prompt);
    const tcell = cell(r, map.type);
    raw.hint = parseType(tcell);
    if (tcell && !raw.hint) raw.issues.push(`«${tcell}» деген сұрақ түрі танылмады.`);
    raw.context = cell(r, map.context);
    raw.answer = cell(r, map.answer) || null;
    raw.explanation = cell(r, map.explanation);
    const pts = cell(r, map.points);
    if (pts) raw.points = Number(pts.replace(',', '.'));
    raw.images = images[i] ?? [];
    for (const o of map.options) {
      const v = cell(r, o.col);
      if (!v) continue;
      const { text, marked } = stripMark(v);
      const pair = splitPair(text);
      if (raw.hint === 'matching' && pair) raw.pairs.push(pair);
      else raw.options.push({ label: o.label, text, marked, bold: false });
    }
    if (!prompt && !raw.options.length) { unread.push(r.map((x) => clean(String(x ?? ''))).filter(Boolean).join(' | ')); continue; }
    // кестеде реттеу: «Жауап» бос болса, нұсқалар бағандардағы ретпен дұрыс деп есептеледі
    questions.push(finalize(raw));
  }
  return { format: 'table', questions, unread, fatal: questions.length ? undefined : 'Кестеде сұрақтар табылмады.' };
}

/* ---------------- Үлгі ---------------- */

export const TEMPLATE_HEADER = ['Түрі', 'Сұрақ', 'Мәтін', 'A', 'B', 'C', 'D', 'E', 'Дұрыс жауап', 'Түсіндірме', 'Ұпай'];
export const TEMPLATE_ROWS: string[][] = [
  ['бір жауапты', 'Қазақ хандығы қай жылы құрылды?', '', '1465', '1511', '1731', '1456', '', 'A', 'Керей мен Жәнібек 1465 жылы', '1'],
  ['бірнеше жауапты', 'Қазақ хандарын таңдаңыз', '', 'Абылай', 'Тәуке', 'Наполеон', 'Шыңғыс', '', 'A, B', '', '2'],
  ['сәйкестендіру', 'Тұлға мен еңбегін сәйкестендіріңіз', '', 'Абай — Қара сөздер', 'Шоқан — Жоңғария очерктері', 'Ыбырай — Кел, балалар, оқылық', '', '', '', '', '2'],
  ['реттеу', 'Оқиғаларды хронологиялық ретпен орналастырыңыз', '', 'Қазақ хандығының құрылуы', 'Тәуке ханның «Жеті жарғысы»', 'Аңырақай шайқасы', '', '', 'A, B, C', '', '1'],
  ['мәтін', 'Мәтін бойынша шайқаста кім жеңді?', 'Аңырақай шайқасы 1730 жылы болды. Қазақ жасағы жоңғарларды жеңді.', 'Қазақ жасағы', 'Жоңғарлар', '', '', '', 'A', '', '1'],
];
