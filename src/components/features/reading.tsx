'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen, BookText, CheckCircle2, Clock, FileText, MessageSquare, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { dateTime, minutesLabel, mondayOf, shortDate, todayISO } from '@/lib/date';
import { REPORT_STATUS } from '@/lib/labels';
import type { BookReport, ReportStatus } from '@/lib/types';
import { Avatar, Badge, EmptyState, ErrorState, LoadingBlock, StatCard, Tabs } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ConfirmModal, Modal } from '@/components/ui/modal';
import { Field, Input, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

export function readingStats(reports: BookReport[]) {
  const monday = mondayOf(todayISO());
  const week = reports.filter((r) => r.read_date >= monday);
  return {
    pages: reports.reduce((s, r) => s + r.pages_read, 0),
    minutes: reports.reduce((s, r) => s + r.minutes_spent, 0),
    books: new Set(reports.map((r) => r.book_title.trim().toLocaleLowerCase('kk'))).size,
    weekPages: week.reduce((s, r) => s + r.pages_read, 0),
    weekMinutes: week.reduce((s, r) => s + r.minutes_spent, 0),
  };
}

export function ReadingStatCards({ reports }: { reports: BookReport[] }) {
  const s = readingStats(reports);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard tone="dark" label="Жалпы оқылған беттер" value={s.pages} icon={BookOpen} />
      <StatCard label="Оқуға жұмсалған уақыт" value={minutesLabel(s.minutes)} icon={Clock} />
      <StatCard label="Оқылған кітаптар" value={s.books} icon={BookText} />
      <StatCard label="Осы аптада" value={`${s.weekPages} бет`} hint={minutesLabel(s.weekMinutes)} icon={FileText} />
    </div>
  );
}

export function useReports(studentId?: string) {
  const q = useLoad(async () => {
    let req = supabaseBrowser().from('book_reports').select('*').order('created_at', { ascending: false });
    if (studentId) req = req.eq('student_id', studentId);
    return must(await req) as BookReport[];
  }, [studentId]);
  useRealtime(['book_reports'], () => q.reload(true), studentId ? `student_id=eq.${studentId}` : undefined);
  return q;
}

export function ReportList({
  reports, loading, error, reload, mode, names, studentId,
}: {
  reports: BookReport[] | null; loading: boolean; error: string | null; reload: () => void;
  mode: 'student' | 'curator'; names?: Map<string, string>; studentId?: string;
}) {
  const params = useSearchParams();
  const [filter, setFilter] = useState<'all' | ReportStatus>(mode === 'curator' ? 'submitted' : 'all');
  const [open, setOpen] = useState<BookReport | null>(null);
  const [edit, setEdit] = useState<BookReport | null>(null);

  useEffect(() => {
    const id = params.get('id');
    if (id && reports) {
      const r = reports.find((x) => x.id === id);
      if (r) setOpen(r);
    }
  }, [params, reports]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reports?.length ?? 0, submitted: 0, accepted: 0, needs_revision: 0 };
    reports?.forEach((r) => c[r.status]++);
    return c;
  }, [reports]);
  const list = (reports ?? []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <div>
      <Tabs
        className="mb-4"
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'submitted', label: 'Тексеруде', count: counts.submitted },
          { value: 'accepted', label: 'Қабылданған', count: counts.accepted },
          { value: 'needs_revision', label: 'Толықтыру қажет', count: counts.needs_revision },
          { value: 'all', label: 'Барлығы', count: counts.all },
        ]}
      />
      {loading ? <LoadingBlock /> : error ? <ErrorState text={error} onRetry={reload} /> : list.length === 0 ? (
        <EmptyState icon={BookOpen} title="Есеп жоқ" text={mode === 'student' ? 'Кітап оқығаннан кейін «Есеп беру» батырмасын басыңыз.' : 'Оқушылар есеп жібергенде осында көрінеді.'} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((r) => (
            <button key={r.id} onClick={() => setOpen(r)} className="card flex flex-col p-4 text-left transition-shadow hover:shadow-lift sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700"><BookOpen className="size-5" /></span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{r.book_title}</p>
                    <p className="text-xs text-muted">{r.section || r.publisher || 'Бөлім көрсетілмеген'}</p>
                  </div>
                </div>
                <Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge>
              </div>
              {mode === 'curator' && names && (
                <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-brand-700"><Avatar name={names.get(r.student_id) ?? '?'} size={20} />{names.get(r.student_id) ?? 'Оқушы'}</p>
              )}
              <p className="mt-2 line-clamp-2 text-sm text-muted">{r.summary}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                <Badge>{r.pages_read} бет</Badge>
                <Badge>{minutesLabel(r.minutes_spent)}</Badge>
                <Badge>{shortDate(r.read_date)}</Badge>
                {r.curator_comment && <Badge tone="brand"><MessageSquare className="size-3" /> Пікір</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && (
        <ReportModal
          report={open} mode={mode} studentName={names?.get(open.student_id)}
          onClose={() => setOpen(null)}
          onEdit={() => { setEdit(open); setOpen(null); }}
          onDone={() => { setOpen(null); reload(); }}
        />
      )}
      {edit && studentId && <ReportFormModal studentId={studentId} report={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function ReportModal({
  report: r, mode, studentName, onClose, onEdit, onDone,
}: { report: BookReport; mode: 'student' | 'curator'; studentName?: string; onClose: () => void; onEdit: () => void; onDone: () => void }) {
  const toast = useToast();
  const [comment, setComment] = useState(r.curator_comment ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState(false);

  const review = async (status: ReportStatus) => {
    if (status === 'needs_revision' && !comment.trim()) return toast.error('Толықтыруға жіберу үшін пікір жазыңыз.');
    setBusy(status);
    const { error } = await supabaseBrowser().from('book_reports').update({ status, curator_comment: comment.trim() || null }).eq('id', r.id);
    setBusy(null);
    if (error) return toast.error(humanError(error));
    toast.success(status === 'accepted' ? 'Есеп қабылданды' : 'Есеп толықтыруға жіберілді');
    onDone();
  };
  const remove = async () => {
    setBusy('del');
    const { error } = await supabaseBrowser().from('book_reports').delete().eq('id', r.id);
    setBusy(null);
    if (error) return toast.error(humanError(error));
    toast.success('Есеп өшірілді');
    onDone();
  };

  return (
    <Modal
      open onClose={onClose} size="lg" title={r.book_title}
      subtitle={`${mode === 'curator' && studentName ? studentName + ' · ' : ''}Жіберілді: ${dateTime(r.created_at)}`}
      footer={mode === 'curator' ? (
        <>
          <Button variant="danger" loading={busy === 'needs_revision'} onClick={() => review('needs_revision')}><RotateCcw className="size-4" /> Толықтыруға</Button>
          <Button loading={busy === 'accepted'} disabled={r.status === 'accepted'} onClick={() => review('accepted')}><CheckCircle2 className="size-4" /> Қабылдау</Button>
        </>
      ) : (
        <>
          {r.status !== 'accepted' && <Button variant="danger" className="mr-auto" onClick={() => setDel(true)}><Trash2 className="size-4" /> Өшіру</Button>}
          {r.status === 'needs_revision' && <Button onClick={onEdit}><Pencil className="size-4" /> Түзету және қайта жіберу</Button>}
          <Button variant="secondary" onClick={onClose}>Жабу</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge>
          <Badge>{r.pages_read} бет</Badge>
          <Badge>{minutesLabel(r.minutes_spent)}</Badge>
          <Badge>Оқыған күні: {shortDate(r.read_date)}</Badge>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-line"><dt className="text-xs text-muted">Баспа</dt><dd className="text-sm font-semibold">{r.publisher || '—'}</dd></div>
          <div className="rounded-2xl bg-white p-3 ring-1 ring-line"><dt className="text-xs text-muted">Бөлім / тақырып</dt><dd className="text-sm font-semibold">{r.section || '—'}</dd></div>
        </dl>
        <section>
          <h4 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Қысқаша мазмұны</h4>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.summary}</p>
        </section>
        {r.reflection && (
          <section className="rounded-2xl bg-brand-50 p-4">
            <h4 className="mb-1 text-xs font-bold tracking-wide text-brand-700 uppercase">Өз түсінігі / пікірі</h4>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.reflection}</p>
          </section>
        )}
        {mode === 'student' && r.curator_comment && (
          <section className={r.status === 'needs_revision' ? 'rounded-2xl bg-bad-soft p-4' : 'rounded-2xl bg-ok-soft p-4'}>
            <h4 className="mb-1 text-xs font-bold text-muted">Куратордың пікірі</h4>
            <p className="text-sm whitespace-pre-wrap">{r.curator_comment}</p>
          </section>
        )}
        {mode === 'curator' && (
          <Field label="Оқушыға пікір"><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} /></Field>
        )}
      </div>
      <ConfirmModal open={del} onClose={() => setDel(false)} onConfirm={remove} loading={busy === 'del'} danger title="Есепті өшіру" text="Есеп біржола өшіріледі." confirmLabel="Өшіру" />
    </Modal>
  );
}

export function ReportFormModal({
  studentId, report, onClose, onSaved,
}: { studentId: string; report?: BookReport | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    book_title: report?.book_title ?? '', publisher: report?.publisher ?? '', pages_read: report ? String(report.pages_read) : '',
    hours: report ? String(Math.floor(report.minutes_spent / 60)) : '', minutes: report ? String(report.minutes_spent % 60) : '',
    section: report?.section ?? '', summary: report?.summary ?? '', reflection: report?.reflection ?? '', read_date: report?.read_date ?? todayISO(),
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => { setErr(null); setF((s) => ({ ...s, [k]: v })); };

  const save = async () => {
    const pages = parseInt(f.pages_read, 10);
    const minutes = (parseInt(f.hours || '0', 10) || 0) * 60 + (parseInt(f.minutes || '0', 10) || 0);
    if (!f.book_title.trim()) return setErr('Кітаптың атауын енгізіңіз.');
    if (!pages || pages < 1 || pages > 5000) return setErr('Оқылған беттер санын дұрыс енгізіңіз (1–5000).');
    if (minutes < 1 || minutes > 1440) return setErr('Оқуға кеткен уақытты енгізіңіз (1 минуттан 24 сағатқа дейін).');
    if (!f.summary.trim()) return setErr('Қысқаша мазмұнын жазыңыз.');
    if (f.read_date > todayISO()) return setErr('Оқыған күн болашақта бола алмайды.');
    setSaving(true);
    const payload = {
      book_title: f.book_title.trim(), publisher: f.publisher.trim() || null, pages_read: pages, minutes_spent: minutes,
      section: f.section.trim() || null, summary: f.summary.trim(), reflection: f.reflection.trim() || null, read_date: f.read_date,
    };
    const sb = supabaseBrowser();
    const { error } = report
      ? await sb.from('book_reports').update(payload).eq('id', report.id)
      : await sb.from('book_reports').insert({ ...payload, student_id: studentId });
    setSaving(false);
    if (error) return setErr(humanError(error));
    toast.success(report ? 'Есеп қайта жіберілді' : 'Есеп кураторға жіберілді');
    onSaved();
  };

  return (
    <Modal
      open onClose={onClose} size="lg" title={report ? 'Есепті түзету' : 'Кітап оқу есебі'} subtitle="Есеп кураторыңыздың кабинетіне түседі"
      footer={<><Button variant="secondary" onClick={onClose}>Бас тарту</Button><Button onClick={save} loading={saving}>Есепті жіберу</Button></>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Кітаптың атауы" required><Input value={f.book_title} onChange={(e) => set('book_title', e.target.value)} maxLength={300} placeholder="Мысалы: Абай жолы" /></Field>
          <Field label="Баспасы" hint="Қажет болған жағдайда"><Input value={f.publisher} onChange={(e) => set('publisher', e.target.value)} maxLength={200} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Оқылған беттер" required><Input type="number" inputMode="numeric" min={1} max={5000} value={f.pages_read} onChange={(e) => set('pages_read', e.target.value)} /></Field>
          <Field label="Сағат"><Input type="number" inputMode="numeric" min={0} max={24} value={f.hours} onChange={(e) => set('hours', e.target.value)} placeholder="0" /></Field>
          <Field label="Минут" required><Input type="number" inputMode="numeric" min={0} max={59} value={f.minutes} onChange={(e) => set('minutes', e.target.value)} placeholder="30" /></Field>
          <Field label="Оқыған күні"><Input type="date" max={todayISO()} value={f.read_date} onChange={(e) => set('read_date', e.target.value)} /></Field>
        </div>
        <Field label="Оқылған бөлім немесе тақырып"><Input value={f.section} onChange={(e) => set('section', e.target.value)} maxLength={300} placeholder="Мысалы: 1-том, 3–5 тараулар" /></Field>
        <Field label="Қысқаша мазмұны" required><Textarea rows={4} value={f.summary} onChange={(e) => set('summary', e.target.value)} maxLength={8000} /></Field>
        <Field label="Өзіңіздің түсінгеніңіз туралы пікір"><Textarea rows={3} value={f.reflection} onChange={(e) => set('reflection', e.target.value)} maxLength={8000} placeholder="Не ұнады? Не үйрендіңіз? Қандай сұрақ туды?" /></Field>
        {err && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  );
}
