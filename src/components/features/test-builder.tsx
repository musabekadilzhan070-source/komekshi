'use client';
import { useState } from 'react';
import clsx from 'clsx';
import {
  ArrowDown, ArrowUp, CheckSquare, Copy, Image as ImageIcon, ListChecks, ListOrdered, Plus, Shuffle, SquareStack, Text, Timer, Trash2, X,
} from 'lucide-react';
import { QUESTION_TYPE } from '@/lib/labels';
import type { Opt, QuestionDraft, QuestionType } from '@/lib/types';
import { IMAGE_ACCEPT } from '@/lib/files';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Badge, EmptyState } from '@/components/ui/misc';
import { FileUploader, SignedImage } from './task-files';

const rid = () => Math.random().toString(36).slice(2, 8);
const opt = (text = ''): Opt => ({ id: rid(), text });

export const QTYPE_ICON: Record<QuestionType, React.ComponentType<{ className?: string }>> = {
  single: CheckSquare, multiple: ListChecks, matching: Shuffle, ordering: ListOrdered, context: Text, image: ImageIcon,
};

export function emptyQuestion(qtype: QuestionType): QuestionDraft {
  const base: QuestionDraft = {
    key: rid(), qtype, prompt: '', context_text: '', image_path: null, options: [], left: [], right: [],
    correct: [], pairs: {}, explanation: '', points: 1,
  };
  if (qtype === 'matching') {
    const l = [opt(), opt()]; const r = [opt(), opt()];
    return { ...base, left: l, right: r, pairs: { [l[0].id]: r[0].id, [l[1].id]: r[1].id } };
  }
  if (qtype === 'ordering') return { ...base, options: [opt(), opt(), opt()] };
  return { ...base, options: [opt(), opt(), opt(), opt()] };
}

/** Редактордағы сұрақ → серверге жіберілетін пішін */
export function draftToPayload(d: QuestionDraft) {
  const clean = (o: Opt[]) => o.map((x) => ({ id: x.id, text: x.text.trim() }));
  const common = {
    qtype: d.qtype, prompt: d.prompt.trim(), context_text: d.qtype === 'context' ? d.context_text.trim() : null,
    image_path: d.image_path, explanation: d.explanation.trim() || null, points: d.points,
  };
  if (d.qtype === 'matching') {
    return { ...common, options: { left: clean(d.left), right: clean(d.right) }, answer: { pairs: d.pairs } };
  }
  if (d.qtype === 'ordering') return { ...common, options: clean(d.options), answer: { order: d.options.map((o) => o.id) } };
  if (d.qtype === 'multiple') return { ...common, options: clean(d.options), answer: { correct: d.correct } };
  return { ...common, options: clean(d.options), answer: { correct: d.correct[0] } };
}

/** Дерекқордағы сұрақ → редактор пішіні (өңдеу үшін) */
export function rowToDraft(r: {
  qtype: QuestionType; prompt: string; context_text: string | null; image_path: string | null; options: unknown;
  answer: { correct?: string | string[]; order?: string[]; pairs?: Record<string, string> }; explanation: string | null; points: number;
}): QuestionDraft {
  const d: QuestionDraft = {
    key: rid(), qtype: r.qtype, prompt: r.prompt, context_text: r.context_text ?? '', image_path: r.image_path,
    options: [], left: [], right: [], correct: [], pairs: {}, explanation: r.explanation ?? '', points: Number(r.points),
  };
  if (r.qtype === 'matching') {
    const o = r.options as { left: Opt[]; right: Opt[] };
    return { ...d, left: o.left, right: o.right, pairs: r.answer.pairs ?? {} };
  }
  const opts = r.options as Opt[];
  if (r.qtype === 'ordering') {
    const order = r.answer.order ?? [];
    return { ...d, options: order.map((id) => opts.find((x) => x.id === id)!).filter(Boolean) };
  }
  const c = r.answer.correct;
  return { ...d, options: opts, correct: Array.isArray(c) ? c : c ? [c] : [] };
}

export function validateDraft(d: QuestionDraft, i: number): string | null {
  const n = `${i + 1}-сұрақ`;
  if (!d.prompt.trim()) return `${n}: сұрақ мәтінін жазыңыз.`;
  if (!(d.points > 0 && d.points <= 100)) return `${n}: ұпай 0-ден 100-ге дейін болуы керек.`;
  if (d.qtype === 'context' && !d.context_text.trim()) return `${n}: оқылатын мәтінді енгізіңіз.`;
  if (d.qtype === 'image' && !d.image_path) return `${n}: сурет тіркеңіз.`;
  if (d.qtype === 'matching') {
    if (d.left.length < 2) return `${n}: кемінде екі жұп керек.`;
    if ([...d.left, ...d.right].some((o) => !o.text.trim())) return `${n}: барлық сәйкестендіру ұяшықтарын толтырыңыз.`;
    return null;
  }
  if (d.options.length < 2) return `${n}: кемінде екі нұсқа керек.`;
  if (d.options.some((o) => !o.text.trim())) return `${n}: бос нұсқаларды толтырыңыз немесе өшіріңіз.`;
  if (d.qtype === 'ordering') return null;
  if (d.correct.length === 0) return `${n}: дұрыс жауапты белгілеңіз.`;
  return null;
}

/** Тест құрастырушы — жеке толық экранды редактор */
export function TestBuilder({
  uid, initial, initialMinutes, locked, onClose, onSave,
}: {
  uid: string; initial: QuestionDraft[]; initialMinutes: number | null; locked?: boolean;
  onClose: () => void; onSave: (qs: QuestionDraft[], minutes: number | null) => void;
}) {
  const [qs, setQs] = useState<QuestionDraft[]>(initial.length ? initial : []);
  const [minutes, setMinutes] = useState<string>(initialMinutes ? String(initialMinutes) : '');
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);

  const update = (key: string, patch: Partial<QuestionDraft>) => { setErr(null); setQs((s) => s.map((q) => (q.key === key ? { ...q, ...patch } : q))); };
  const move = (i: number, dir: -1 | 1) => setQs((s) => {
    const j = i + dir; if (j < 0 || j >= s.length) return s;
    const c = [...s]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const add = (t: QuestionType) => { setErr(null); setQs((s) => [...s, emptyQuestion(t)]); };
  const total = qs.reduce((a, q) => a + (Number(q.points) || 0), 0);

  const save = () => {
    if (qs.length === 0) return setErr('Тестке кемінде бір сұрақ қосыңыз.');
    for (let i = 0; i < qs.length; i++) { const e = validateDraft(qs[i], i); if (e) return setErr(e); }
    const m = minutes.trim() ? Number(minutes) : null;
    if (m != null && !(Number.isInteger(m) && m >= 1 && m <= 600)) return setErr('Тест уақыты 1–600 минут аралығында болуы керек.');
    onSave(qs, m);
  };

  return (
    <Modal
      open onClose={onClose} size="xl" title="Тест құрастыру"
      subtitle={locked ? 'Оқушылар тестті тапсыра бастаған — сұрақтарды тек көруге болады' : `${qs.length} сұрақ · жалпы ${total} ұпай`}
      footer={locked ? <Button variant="secondary" onClick={onClose}>Жабу</Button> : (
        <><Button variant="secondary" onClick={onClose}>Бас тарту</Button>
          <Button onClick={save} disabled={uploading > 0} data-testid="test-save"><ListChecks className="size-4" /> Тестті сақтау</Button></>
      )}
    >
      <fieldset disabled={locked} className="space-y-5">
        <div className="grid gap-3 rounded-3xl bg-navy-900 p-4 text-white sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
          <div>
            <p className="text-sm font-bold">Тест параметрлері</p>
            <p className="mt-0.5 text-xs text-white/70">Сұрақтар саны мен ретін өзіңіз анықтайсыз. Нұсқалар оқушыға аралас көрсетіледі (сәйкестендіру мен ретте).</p>
          </div>
          <label className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm">
            <Timer className="size-4 text-sand-300" />
            <span className="whitespace-nowrap">Уақыты</span>
            <input
              type="number" min={1} max={600} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)}
              placeholder="шексіз" aria-label="Тест уақыты (минут)"
              className="w-20 rounded-xl bg-white px-2 py-1.5 text-center text-sm font-bold text-navy-900 outline-none"
            />
            <span className="text-white/70">мин</span>
          </label>
        </div>

        {qs.length === 0 && <EmptyState icon={ListChecks} title="Сұрақтар әлі жоқ" text="Төмендегі батырмалардан сұрақ түрін таңдап, тестті құрастырыңыз." />}

        {qs.map((q, i) => (
          <QuestionCard
            key={q.key} q={q} index={i} count={qs.length} uid={uid}
            onChange={(p) => update(q.key, p)} onMove={(d) => move(i, d)}
            onDuplicate={() => setQs((s) => [...s.slice(0, i + 1), { ...structuredClone(q), key: rid() }, ...s.slice(i + 1)])}
            onRemove={() => setQs((s) => s.filter((x) => x.key !== q.key))}
            onUploading={(b) => setUploading((n) => n + (b ? 1 : -1))}
          />
        ))}

        {!locked && (
          <div className="rounded-3xl border-2 border-dashed border-sand-300 p-4">
            <p className="mb-3 text-sm font-bold text-navy-900">Сұрақ қосу</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(QUESTION_TYPE) as QuestionType[]).map((t) => {
                const Icon = QTYPE_ICON[t];
                return (
                  <button key={t} type="button" onClick={() => add(t)} data-testid={`add-q-${t}`}
                    className="flex items-center gap-2.5 rounded-2xl bg-white p-3 text-left ring-1 ring-line transition hover:ring-navy-300">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-navy-100 text-navy-900"><Icon className="size-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold leading-tight text-navy-900">{QUESTION_TYPE[t].label}</span>
                      <span className="block truncate text-[11px] text-muted">{QUESTION_TYPE[t].hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {err && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
      </fieldset>
    </Modal>
  );
}

function IconBtn({ label, onClick, disabled, children, danger }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={clsx('flex size-8 items-center justify-center rounded-full transition disabled:opacity-30',
        danger ? 'text-muted hover:bg-bad-soft hover:text-bad' : 'text-navy-900 hover:bg-navy-50')}>
      {children}
    </button>
  );
}

function QuestionCard({
  q, index, count, uid, onChange, onMove, onDuplicate, onRemove, onUploading,
}: {
  q: QuestionDraft; index: number; count: number; uid: string; onChange: (p: Partial<QuestionDraft>) => void;
  onMove: (d: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void; onUploading: (b: boolean) => void;
}) {
  const Icon = QTYPE_ICON[q.qtype];
  const choice = q.qtype !== 'matching' && q.qtype !== 'ordering';
  const multi = q.qtype === 'multiple';

  const setOpt = (id: string, text: string) => onChange({ options: q.options.map((o) => (o.id === id ? { ...o, text } : o)) });
  const removeOpt = (id: string) => onChange({ options: q.options.filter((o) => o.id !== id), correct: q.correct.filter((c) => c !== id) });
  const toggleCorrect = (id: string) => onChange({
    correct: multi ? (q.correct.includes(id) ? q.correct.filter((c) => c !== id) : [...q.correct, id]) : [id],
  });
  const moveOpt = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= q.options.length) return;
    const c = [...q.options]; [c[i], c[j]] = [c[j], c[i]]; onChange({ options: c });
  };

  return (
    <section className="card relative overflow-hidden p-4 sm:p-5" data-testid="question-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-navy-900 text-sm font-extrabold text-mist">{index + 1}</span>
          <Badge tone="navy"><Icon className="size-3" /> {QUESTION_TYPE[q.qtype].label}</Badge>
        </div>
        <div className="flex items-center gap-0.5">
          <IconBtn label="Жоғары жылжыту" onClick={() => onMove(-1)} disabled={index === 0}><ArrowUp className="size-4" /></IconBtn>
          <IconBtn label="Төмен жылжыту" onClick={() => onMove(1)} disabled={index === count - 1}><ArrowDown className="size-4" /></IconBtn>
          <IconBtn label="Көшірме жасау" onClick={onDuplicate}><Copy className="size-4" /></IconBtn>
          <IconBtn label="Сұрақты өшіру" onClick={onRemove} danger><Trash2 className="size-4" /></IconBtn>
        </div>
      </div>

      <div className="space-y-4">
        {q.qtype === 'context' && (
          <Field label="Оқылатын мәтін" required>
            <Textarea rows={4} value={q.context_text} onChange={(e) => onChange({ context_text: e.target.value })} maxLength={12000} placeholder="Оқушы осы мәтінді оқып, сұраққа жауап береді" />
          </Field>
        )}
        <Field label="Сұрақ мәтіні" required>
          <Textarea rows={2} value={q.prompt} onChange={(e) => onChange({ prompt: e.target.value })} maxLength={4000}
            placeholder={q.qtype === 'ordering' ? 'Мысалы: Оқиғаларды хронологиялық ретпен орналастырыңыз' : q.qtype === 'matching' ? 'Мысалы: Тұлғалар мен еңбектерін сәйкестендіріңіз' : 'Сұрақты жазыңыз'} />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-navy-900">Сурет {q.qtype === 'image' ? <span className="text-bad">*</span> : <span className="font-normal text-muted">(міндетті емес)</span>}</p>
          {q.image_path ? (
            <div className="relative inline-block">
              <SignedImage path={q.image_path} alt="Сұрақ суреті" className="max-h-52 ring-1 ring-line" />
              <button type="button" onClick={() => onChange({ image_path: null })} aria-label="Суретті алып тастау"
                className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-white/90 text-bad shadow"><X className="size-4" /></button>
            </div>
          ) : (
            <FileUploader uid={uid} folder={`q-${q.key}`} accept={IMAGE_ACCEPT} maxMb={10} label="Сурет тіркеу" hint="JPG, PNG, WebP · 10 МБ-қа дейін"
              onBusyChange={onUploading} onUploaded={(f) => onChange({ image_path: f.storage_path })} />
          )}
        </div>

        {choice && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-navy-900">
              Жауап нұсқалары <span className="font-normal text-muted">— {multi ? 'барлық дұрыс жауапты белгілеңіз' : 'дұрыс жауапты белгілеңіз'}</span>
            </p>
            <div className="space-y-2">
              {q.options.map((o, i) => {
                const on = q.correct.includes(o.id);
                return (
                  <div key={o.id} className={clsx('flex items-center gap-2 rounded-2xl p-1.5 pl-2 ring-1', on ? 'bg-ok-soft ring-ok/40' : 'bg-white ring-line')}>
                    <button type="button" onClick={() => toggleCorrect(o.id)} aria-pressed={on} aria-label={`${i + 1}-нұсқаны дұрыс деп белгілеу`}
                      className={clsx('flex size-7 shrink-0 items-center justify-center border-2 text-[11px] font-bold', multi ? 'rounded-lg' : 'rounded-full',
                        on ? 'border-ok bg-ok text-white' : 'border-navy-300 text-navy-700')}>
                      {on ? '✓' : String.fromCharCode(65 + i)}
                    </button>
                    <input value={o.text} onChange={(e) => setOpt(o.id, e.target.value)} maxLength={1000} placeholder={`${i + 1}-нұсқа`}
                      className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none" />
                    <IconBtn label="Нұсқаны өшіру" onClick={() => removeOpt(o.id)} disabled={q.options.length <= 2} danger><X className="size-4" /></IconBtn>
                  </div>
                );
              })}
            </div>
            {q.options.length < 10 && (
              <button type="button" onClick={() => onChange({ options: [...q.options, opt()] })} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:underline">
                <Plus className="size-4" /> Нұсқа қосу
              </button>
            )}
          </div>
        )}

        {q.qtype === 'ordering' && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-navy-900">Элементтер <span className="font-normal text-muted">— дұрыс ретпен жазыңыз, оқушыға аралас көрсетіледі</span></p>
            <div className="space-y-2">
              {q.options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2 rounded-2xl bg-white p-1.5 pl-2 ring-1 ring-line">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-mist">{i + 1}</span>
                  <input value={o.text} onChange={(e) => setOpt(o.id, e.target.value)} maxLength={1000} placeholder={`${i + 1}-оқиға / элемент`}
                    className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none" />
                  <IconBtn label="Жоғары" onClick={() => moveOpt(i, -1)} disabled={i === 0}><ArrowUp className="size-4" /></IconBtn>
                  <IconBtn label="Төмен" onClick={() => moveOpt(i, 1)} disabled={i === q.options.length - 1}><ArrowDown className="size-4" /></IconBtn>
                  <IconBtn label="Өшіру" onClick={() => removeOpt(o.id)} disabled={q.options.length <= 2} danger><X className="size-4" /></IconBtn>
                </div>
              ))}
            </div>
            {q.options.length < 10 && (
              <button type="button" onClick={() => onChange({ options: [...q.options, opt()] })} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:underline">
                <Plus className="size-4" /> Элемент қосу
              </button>
            )}
          </div>
        )}

        {q.qtype === 'matching' && <MatchingEditor q={q} onChange={onChange} />}

        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field label="Түсіндірме (тесттен кейін көрсетіледі)">
            <Textarea rows={2} value={q.explanation} onChange={(e) => onChange({ explanation: e.target.value })} maxLength={4000} placeholder="Неліктен бұл жауап дұрыс?" />
          </Field>
          <Field label="Ұпай">
            <Input type="number" min={0.5} max={100} step={0.5} value={q.points} onChange={(e) => onChange({ points: Number(e.target.value) })} />
          </Field>
        </div>
      </div>
    </section>
  );
}

function MatchingEditor({ q, onChange }: { q: QuestionDraft; onChange: (p: Partial<QuestionDraft>) => void }) {
  const paired = new Set(Object.values(q.pairs));
  const extras = q.right.filter((r) => !paired.has(r.id));
  const setText = (side: 'left' | 'right', id: string, text: string) =>
    onChange({ [side]: q[side].map((o) => (o.id === id ? { ...o, text } : o)) } as Partial<QuestionDraft>);
  const addPair = () => {
    const l = opt(); const r = opt();
    onChange({ left: [...q.left, l], right: [...q.right, r], pairs: { ...q.pairs, [l.id]: r.id } });
  };
  const removePair = (lid: string) => {
    const rid2 = q.pairs[lid];
    const pairs = { ...q.pairs }; delete pairs[lid];
    onChange({ left: q.left.filter((o) => o.id !== lid), right: q.right.filter((o) => o.id !== rid2), pairs });
  };
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-navy-900">Сәйкес жұптар <span className="font-normal text-muted">— оң жақ баған оқушыға аралас көрсетіледі</span></p>
      <div className="space-y-2">
        {q.left.map((l, i) => {
          const r = q.right.find((x) => x.id === q.pairs[l.id]);
          return (
            <div key={l.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-2xl bg-white p-2 ring-1 ring-line sm:grid-cols-[1fr_auto_1fr_auto]">
              <input value={l.text} onChange={(e) => setText('left', l.id, e.target.value)} maxLength={1000} placeholder={`${i + 1}. Сол жақ`}
                className="min-w-0 rounded-xl bg-mist/50 px-3 py-2 text-sm outline-none" />
              <SquareStack className="hidden size-4 text-sand-500 sm:block" />
              <input value={r?.text ?? ''} onChange={(e) => r && setText('right', r.id, e.target.value)} maxLength={1000} placeholder="Сәйкес жауап"
                className="col-span-1 min-w-0 rounded-xl bg-navy-50 px-3 py-2 text-sm outline-none sm:col-span-1" />
              <IconBtn label="Жұпты өшіру" onClick={() => removePair(l.id)} disabled={q.left.length <= 2} danger><X className="size-4" /></IconBtn>
            </div>
          );
        })}
        {extras.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-2xl bg-white p-2 ring-1 ring-dashed ring-sand-300">
            <span className="shrink-0 px-1 text-[11px] font-semibold text-muted">Артық нұсқа</span>
            <input value={r.text} onChange={(e) => setText('right', r.id, e.target.value)} maxLength={1000} placeholder="Қате (алаңдататын) нұсқа"
              className="min-w-0 flex-1 rounded-xl bg-navy-50 px-3 py-2 text-sm outline-none" />
            <IconBtn label="Өшіру" onClick={() => onChange({ right: q.right.filter((x) => x.id !== r.id) })} danger><X className="size-4" /></IconBtn>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        {q.left.length < 10 && <button type="button" onClick={addPair} className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:underline"><Plus className="size-4" /> Жұп қосу</button>}
        {q.right.length < 12 && <button type="button" onClick={() => onChange({ right: [...q.right, opt()] })} className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:underline"><Plus className="size-4" /> Артық нұсқа</button>}
      </div>
    </div>
  );
}
