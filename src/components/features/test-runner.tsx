'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { AlarmClock, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, CircleX, Flag, MinusCircle, Send } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { humanError } from '@/lib/errors';
import { dateTime, durationLabel } from '@/lib/date';
import { QUESTION_TYPE } from '@/lib/labels';
import type { Opt, RunnerQuestion, TestResult, TestResultItem, TestStart } from '@/lib/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, LoadingBlock, ProgressRing } from '@/components/ui/misc';
import { Ornament } from '@/components/ui/ornament';
import { SignedImage } from './task-files';

type Answers = Record<string, unknown>;

function isAnswered(q: RunnerQuestion, a: unknown) {
  if (a == null) return false;
  if (q.qtype === 'multiple') return Array.isArray(a) && a.length > 0;
  if (q.qtype === 'matching') {
    const left = (q.options as { left: Opt[] }).left;
    return typeof a === 'object' && left.every((l) => (a as Record<string, string>)[l.id]);
  }
  if (q.qtype === 'ordering') return Array.isArray(a);
  return typeof a === 'string' && a !== '';
}

const draftKey = (id: string) => `kom-test-${id}`;
function loadDraft(id: string): Answers {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) || '{}'); } catch { return {}; }
}
function saveDraft(id: string, a: Answers) {
  try { localStorage.setItem(draftKey(id), JSON.stringify(a)); } catch { /* жеке режимде сақталмауы мүмкін */ }
}
function clearDraft(id: string) {
  try { localStorage.removeItem(draftKey(id)); } catch { /* */ }
}

/** Оқушының тест тапсыру терезесі */
export function TestRunner({
  submissionId, title, onClose, onFinished,
}: { submissionId: string; title: string; onClose: () => void; onFinished: (r: TestResult) => void }) {
  const [data, setData] = useState<TestStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [i, setI] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const skew = useRef(0);
  const sentRef = useRef(false);

  useEffect(() => {
    supabaseBrowser().rpc('start_test', { p_submission: submissionId }).then(({ data, error }) => {
      if (error) return setError(humanError(error));
      const d = data as TestStart;
      skew.current = new Date(d.server_now).getTime() - Date.now();
      const draft = loadDraft(submissionId);
      // Рет сұрақтарында көрсетілген рет — бастапқы жауап
      const init: Answers = {};
      d.questions.forEach((q) => {
        if (q.qtype === 'ordering') init[q.id] = (q.options as Opt[]).map((o) => o.id);
        if (draft[q.id] !== undefined) init[q.id] = draft[q.id];
      });
      setAnswers(init);
      setData(d);
    });
  }, [submissionId]);

  const submit = useCallback(async (auto = false) => {
    if (!data || sentRef.current) return;
    sentRef.current = true;
    setSending(true);
    setConfirm(false);
    const { data: res, error } = await supabaseBrowser().rpc('submit_test', { p_submission: submissionId, p_answers: answers });
    setSending(false);
    if (error) {
      sentRef.current = false;
      return setError(humanError(error));
    }
    clearDraft(submissionId);
    setResult({ ...(res as TestResult), late: (res as TestResult).late || undefined });
    onFinished(res as TestResult);
    if (auto) setLeft(0);
  }, [data, answers, submissionId, onFinished]);

  // Таймер
  useEffect(() => {
    if (!data?.time_limit_minutes || result) return;
    const deadline = new Date(data.started_at).getTime() + data.time_limit_minutes * 60_000;
    const tick = () => {
      const ms = deadline - (Date.now() + skew.current);
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data, result, submit]);

  const setAnswer = (qid: string, v: unknown) => {
    setAnswers((s) => {
      const n = { ...s, [qid]: v };
      saveDraft(submissionId, n);
      return n;
    });
  };

  const qs = data?.questions ?? [];
  const q = qs[i];
  const answered = qs.filter((x) => isAnswered(x, answers[x.id])).length;

  return (
    <Modal open onClose={onClose} size="xl" title={title} subtitle={result ? 'Тест нәтижесі' : data ? `${qs.length} сұрақ · ${answered} жауап берілді` : 'Тест жүктелуде'}
      footer={result ? <Button onClick={onClose}>Жабу</Button> : data && q ? (
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="secondary" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="Алдыңғы сұрақ"><ArrowLeft className="size-4" /><span className="hidden sm:inline">Алдыңғы</span></Button>
          {i < qs.length - 1 ? (
            <Button onClick={() => setI((x) => x + 1)} data-testid="next-q">Келесі <ArrowRight className="size-4" /></Button>
          ) : (
            <Button onClick={() => (answered < qs.length ? setConfirm(true) : submit())} loading={sending} data-testid="finish-test"><Send className="size-4" /> Тестті аяқтау</Button>
          )}
        </div>
      ) : undefined}
    >
      {error ? <ErrorState text={error} /> : result ? (
        <TestResultView result={result} />
      ) : !data ? <LoadingBlock rows={4} /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
          <div className="min-w-0">
            {q && <QuestionView q={q} index={i} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />}
          </div>
          <aside className="order-first space-y-3 lg:order-none">
            {left != null && (
              <div className={clsx('flex items-center gap-2 rounded-2xl px-4 py-3 font-bold', left <= 60 ? 'bg-bad-soft text-bad' : 'bg-navy-900 text-white')} role="timer" aria-live="off">
                <AlarmClock className="size-5" />
                <span className="tabular-nums">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</span>
                <span className="ml-auto text-[11px] font-semibold opacity-75">қалды</span>
              </div>
            )}
            <div className="rounded-2xl bg-white p-3 ring-1 ring-line">
              <p className="mb-2 text-[11px] font-semibold text-muted">Сұрақтар</p>
              <div className="grid grid-cols-8 gap-1.5 lg:grid-cols-5">
                {qs.map((x, j) => (
                  <button key={x.id} type="button" onClick={() => setI(j)} aria-label={`${j + 1}-сұрақ`} aria-current={j === i}
                    className={clsx('flex aspect-square items-center justify-center rounded-lg text-xs font-bold transition',
                      j === i ? 'bg-navy-900 text-white' : isAnswered(x, answers[x.id]) ? 'bg-navy-100 text-navy-900' : 'bg-mist text-muted')}>
                    {j + 1}
                  </button>
                ))}
              </div>
            </div>
          </aside>
          {confirm && (
            <div role="alertdialog" className="rounded-2xl bg-warn-soft p-4 text-sm text-warn lg:col-span-2">
              <p className="font-bold"><Flag className="mr-1 inline size-4" /> {qs.length - answered} сұраққа жауап берілмеген.</p>
              <p className="mt-1">Тестті аяқтағаннан кейін жауапты өзгертуге болмайды.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>Жалғастыру</Button>
                <Button size="sm" onClick={() => submit()} loading={sending} data-testid="confirm-finish">Иә, аяқтау</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ChoiceRow({ on, multi, label, letter, onClick }: { on: boolean; multi?: boolean; label: string; letter: string; onClick: () => void }) {
  return (
    <button type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={on} onClick={onClick}
      className={clsx('flex w-full items-center gap-3 rounded-2xl p-3 text-left text-sm ring-1 transition',
        on ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-ink ring-line hover:ring-navy-300')}>
      <span className={clsx('flex size-7 shrink-0 items-center justify-center border-2 text-[11px] font-bold', multi ? 'rounded-lg' : 'rounded-full',
        on ? 'border-mist bg-mist text-navy-900' : 'border-navy-300 text-navy-700')}>{on ? '✓' : letter}</span>
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  );
}

function QuestionView({ q, index, value, onChange }: { q: RunnerQuestion; index: number; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <div className="space-y-4" data-testid="runner-question">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-navy-900 text-sm font-extrabold text-mist">{index + 1}</span>
        <Badge tone="navy">{QUESTION_TYPE[q.qtype].label}</Badge>
        <Badge>{Number(q.points)} ұпай</Badge>
      </div>
      {q.context_text && (
        <div className="relative overflow-hidden rounded-2xl bg-sand-100 p-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">
          <Ornament kind="botakoz" className="absolute -top-3 -right-3 size-16 text-sand-500/30" />
          <span className="relative">{q.context_text}</span>
        </div>
      )}
      {q.image_path && <SignedImage path={q.image_path} alt="Сұрақ суреті" className="max-h-80 w-auto ring-1 ring-line" />}
      <p className="text-base font-bold leading-snug whitespace-pre-wrap text-navy-900">{q.prompt}</p>

      {(q.qtype === 'single' || q.qtype === 'context' || q.qtype === 'image') && (
        <div className="space-y-2" role="radiogroup">
          {(q.options as Opt[]).map((o, j) => (
            <ChoiceRow key={o.id} on={value === o.id} label={o.text} letter={String.fromCharCode(65 + j)} onClick={() => onChange(o.id)} />
          ))}
        </div>
      )}
      {q.qtype === 'multiple' && (
        <div className="space-y-2">
          <p className="text-xs text-muted">Бірнеше дұрыс жауап болуы мүмкін</p>
          {(q.options as Opt[]).map((o, j) => {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            const on = arr.includes(o.id);
            return <ChoiceRow key={o.id} multi on={on} label={o.text} letter={String.fromCharCode(65 + j)}
              onClick={() => onChange(on ? arr.filter((x) => x !== o.id) : [...arr, o.id])} />;
          })}
        </div>
      )}
      {q.qtype === 'matching' && <MatchingInput q={q} value={value as Record<string, string> | undefined} onChange={onChange} />}
      {q.qtype === 'ordering' && <OrderingInput q={q} value={value as string[] | undefined} onChange={onChange} />}
    </div>
  );
}

function MatchingInput({ q, value, onChange }: { q: RunnerQuestion; value?: Record<string, string>; onChange: (v: unknown) => void }) {
  const { left, right } = q.options as { left: Opt[]; right: Opt[] };
  const v = value ?? {};
  return (
    <div className="space-y-2">
      {left.map((l, j) => (
        <div key={l.id} className="grid items-center gap-2 rounded-2xl bg-white p-2.5 ring-1 ring-line sm:grid-cols-2">
          <p className="text-sm font-semibold text-navy-900"><span className="mr-1.5 text-muted">{j + 1}.</span>{l.text}</p>
          <select value={v[l.id] ?? ''} onChange={(e) => onChange({ ...v, [l.id]: e.target.value })} aria-label={`${l.text} — сәйкес жауап`}
            className="field-input !py-2">
            <option value="">— Таңдаңыз —</option>
            {right.map((r) => <option key={r.id} value={r.id}>{r.text}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function OrderingInput({ q, value, onChange }: { q: RunnerQuestion; value?: string[]; onChange: (v: unknown) => void }) {
  const opts = q.options as Opt[];
  const order = value && value.length === opts.length ? value : opts.map((o) => o.id);
  const move = (j: number, d: -1 | 1) => {
    const k = j + d; if (k < 0 || k >= order.length) return;
    const c = [...order]; [c[j], c[k]] = [c[k], c[j]]; onChange(c);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Бағыттауыштар арқылы дұрыс ретке келтіріңіз (жоғарыдан төмен қарай)</p>
      {order.map((id, j) => {
        const o = opts.find((x) => x.id === id)!;
        return (
          <div key={id} className="flex items-center gap-2 rounded-2xl bg-white p-2 pl-3 ring-1 ring-line" data-testid="order-item">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-mist">{j + 1}</span>
            <span className="min-w-0 flex-1 text-sm">{o?.text}</span>
            <button type="button" onClick={() => move(j, -1)} disabled={j === 0} aria-label={`${o?.text} — жоғары`} className="flex size-9 items-center justify-center rounded-full text-navy-900 hover:bg-navy-50 disabled:opacity-30"><ArrowUp className="size-4" /></button>
            <button type="button" onClick={() => move(j, 1)} disabled={j === order.length - 1} aria-label={`${o?.text} — төмен`} className="flex size-9 items-center justify-center rounded-full text-navy-900 hover:bg-navy-50 disabled:opacity-30"><ArrowDown className="size-4" /></button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Нәтиже ----------------

function textOf(opts: Opt[], id: unknown) { return opts.find((o) => o.id === id)?.text ?? '—'; }

function ItemReview({ it, index }: { it: TestResultItem; index: number }) {
  const full = Number(it.earned) >= Number(it.points);
  const none = Number(it.earned) === 0;
  const Icon = full ? CheckCircle2 : none ? CircleX : MinusCircle;
  const opts = Array.isArray(it.options) ? (it.options as Opt[]) : [];
  const given = it.given;

  let givenText: React.ReactNode = <i className="text-muted">Жауап берілмеген</i>;
  let correctText: React.ReactNode = null;
  if (it.qtype === 'multiple') {
    if (Array.isArray(given) && given.length) givenText = (given as string[]).map((g) => textOf(opts, g)).join('; ');
    correctText = ((it.answer.correct as string[]) ?? []).map((c) => textOf(opts, c)).join('; ');
  } else if (it.qtype === 'ordering') {
    if (Array.isArray(given)) givenText = (given as string[]).map((g, j) => `${j + 1}) ${textOf(opts, g)}`).join('  ');
    correctText = (it.answer.order ?? []).map((c, j) => `${j + 1}) ${textOf(opts, c)}`).join('  ');
  } else if (it.qtype === 'matching') {
    const o = it.options as { left: Opt[]; right: Opt[] };
    const g = (given ?? {}) as Record<string, string>;
    givenText = given ? (
      <ul className="space-y-0.5">{o.left.map((l) => <li key={l.id}>{l.text} → {g[l.id] ? textOf(o.right, g[l.id]) : '—'}</li>)}</ul>
    ) : givenText;
    correctText = <ul className="space-y-0.5">{o.left.map((l) => <li key={l.id}>{l.text} → {textOf(o.right, it.answer.pairs?.[l.id])}</li>)}</ul>;
  } else {
    if (typeof given === 'string') givenText = textOf(opts, given);
    correctText = textOf(opts, it.answer.correct);
  }

  return (
    <li className={clsx('rounded-2xl p-4 ring-1', full ? 'bg-ok-soft/50 ring-ok/25' : none ? 'bg-bad-soft/50 ring-bad/20' : 'bg-warn-soft/50 ring-warn/25')} data-testid="result-item">
      <div className="flex items-start gap-3">
        <Icon className={clsx('mt-0.5 size-5 shrink-0', full ? 'text-ok' : none ? 'text-bad' : 'text-warn')} />
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-bold text-navy-900">{index + 1}. {it.prompt}</p>
            <Badge tone={full ? 'ok' : none ? 'bad' : 'warn'}>{Number(it.earned)} / {Number(it.points)}</Badge>
          </div>
          {it.image_path && <SignedImage path={it.image_path} alt="Сұрақ суреті" className="max-h-40" />}
          <div className="grid gap-2 sm:grid-cols-2">
            <div><p className="text-[11px] font-semibold text-muted">Берілген жауап</p><div>{givenText}</div></div>
            {!full && <div><p className="text-[11px] font-semibold text-muted">Дұрыс жауап</p><div className="font-semibold text-ok">{correctText}</div></div>}
          </div>
          {it.explanation && <p className="rounded-xl bg-white/70 px-3 py-2 text-xs leading-relaxed text-ink"><b>Түсіндірме:</b> {it.explanation}</p>}
        </div>
      </div>
    </li>
  );
}

export function TestResultView({ result }: { result: TestResult }) {
  const pct = useMemo(() => (result.max_score ? Math.round((Number(result.score) * 100) / Number(result.max_score)) : 0), [result]);
  if (!result.finished_at) {
    return <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">Тест басталған ({dateTime(result.started_at)}), бірақ әлі аяқталмаған.</p>;
  }
  return (
    <div className="space-y-5" data-testid="test-result">
      <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-3xl bg-navy-900 p-5 text-white sm:flex-row">
        <Ornament kind="koshkar" className="absolute -top-8 -right-8 size-44 text-mist/[0.07]" strokeWidth={1.6} />
        <ProgressRing value={pct} light size={112} label="нәтиже" />
        <div className="relative text-center sm:text-left">
          <p className="text-3xl font-extrabold" data-testid="test-score">{Number(result.score)} / {Number(result.max_score)} ұпай</p>
          <p className="mt-1 text-sm text-white/75">
            Орындалған уақыты: {durationLabel(result.duration_seconds ?? 0)} · {dateTime(result.finished_at)}
            {result.attempt_no > 1 && ` · ${result.attempt_no}-әрекет`}
          </p>
          {result.late && <Badge tone="warn" className="mt-2">Уақыттан кеш тапсырылды</Badge>}
        </div>
      </div>
      {result.items && (
        <ol className="space-y-3">{result.items.map((it, j) => <ItemReview key={it.id} it={it} index={j} />)}</ol>
      )}
    </div>
  );
}
