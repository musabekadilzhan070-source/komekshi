'use client';
import { useState } from 'react';
import { Archive, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad } from '@/lib/hooks';
import { dateTime, MONTHS, shortDate } from '@/lib/date';
import { PRIORITY, SUBMISSION_STATUS, TASK_KIND } from '@/lib/labels';
import type { Priority, SubmissionStatus, TaskKind } from '@/lib/types';
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/misc';

type ArchiveStudent = {
  submission_id: string; student_name: string | null; status: SubmissionStatus;
  submitted_at: string | null; reviewed_at: string | null; deleted_at: string; deleted_by_name: string | null;
  score: number | null; max_score: number | null; started_at: string | null; finished_at: string | null;
};
type ArchiveTask = {
  id: string; title: string; kind: TaskKind; priority: Priority; start_date: string; due_date: string; created_at: string;
  period_year: number; period_month: number; period_week: number; deleted_at: string | null;
  curator_name: string | null; deleted_by_name: string | null; last_deleted: string; fully_deleted: boolean;
  students: ArchiveStudent[];
};

const mins = (a: string | null, b: string | null) => (a && b ? Math.max(1, Math.round((+new Date(b) - +new Date(a)) / 60000)) : null);

export default function OrganizerArchivePage() {
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => must(await supabaseBrowser().rpc('deleted_tasks_archive', { p_limit: 200 })) as ArchiveTask[]);
  return (
    <>
      <PageHeader title="Тапсырмалар архиві" subtitle="Кураторлар өшірген тапсырмалар: орындалу тарихы мен нәтижелері сақталады. Оқушылар мен кураторлар бұл тапсырмаларды көрмейді." />
      {loading ? <LoadingBlock rows={4} /> : error ? <ErrorState text={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon={Archive} title="Өшірілген тапсырма жоқ" text="Куратор тапсырманы өшіргенде, оның тарихы осында сақталады." />
      ) : (
        <div className="space-y-3">
          {data.map((t) => {
            const isOpen = open === t.id;
            return (
              <Card key={t.id} className="p-4 sm:p-5" data-testid="archive-task">
                <button type="button" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-3 text-left">
                  <span className="min-w-0">
                    <span className="block font-bold text-ink">{t.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Куратор: {t.curator_name ?? '—'} · {MONTHS[t.period_month - 1]} {t.period_year}, {t.period_week}-апта · {shortDate(t.start_date)} – {shortDate(t.due_date)}
                    </span>
                  </span>
                  <ChevronDown className={clsx('mt-1 size-4 shrink-0 text-muted transition-transform', isOpen && 'rotate-180')} />
                </button>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="brand">{TASK_KIND[t.kind].label}</Badge>
                  <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
                  <Badge tone="bad">{t.fully_deleted ? 'Барлық оқушыдан өшірілген' : `${t.students.length} оқушыдан өшірілген`}</Badge>
                  <Badge>Өшірілді: {dateTime(t.last_deleted)}</Badge>
                </div>
                {isOpen && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="text-[11px] font-semibold text-muted uppercase">
                        <tr className="border-b border-line">
                          <th className="py-2 pr-3">Оқушы</th><th className="py-2 pr-3">Күйі</th><th className="py-2 pr-3">Нәтиже</th>
                          <th className="py-2 pr-3">Тапсырды</th><th className="py-2">Кім өшірді</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.students.map((s) => (
                          <tr key={s.submission_id} className="border-b border-line/70 last:border-0">
                            <td className="py-2.5 pr-3 font-semibold text-ink">{s.student_name ?? 'Оқушы'}</td>
                            <td className="py-2.5 pr-3"><Badge tone={SUBMISSION_STATUS[s.status].tone}>{SUBMISSION_STATUS[s.status].label}</Badge></td>
                            <td className="py-2.5 pr-3 text-ink">
                              {s.finished_at && s.max_score != null
                                ? <>{Number(s.score)} / {Number(s.max_score)} · {Math.round((Number(s.score) * 100) / Math.max(1, Number(s.max_score)))}%{mins(s.started_at, s.finished_at) ? ` · ${mins(s.started_at, s.finished_at)} мин` : ''}</>
                                : '—'}
                            </td>
                            <td className="py-2.5 pr-3 text-muted">{s.submitted_at ? dateTime(s.submitted_at) : '—'}</td>
                            <td className="py-2.5 text-muted">{s.deleted_by_name ?? '—'}, {dateTime(s.deleted_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
