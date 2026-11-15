'use client';
import Link from 'next/link';
import { minutesLabel } from '@/lib/date';
import type { StudentOverview } from '@/lib/types';
import { Avatar, Card, ProgressBar } from '@/components/ui/misc';
import { Bars } from './charts';

const r = (a: number, b: number) => (b ? Math.round((a * 100) / b) : null);

/** Оқушыларды салыстыру кестесі + диаграммалар */
export function StudentComparison({ students, linkBase }: { students: StudentOverview[]; linkBase?: string }) {
  const rows = students.map((s) => ({
    ...s,
    tasks_pct: r(s.tasks_accepted, s.tasks_total),
    plans_pct: r(s.plans_done, s.plans_total),
    qa_pct: r(s.qa_completed, s.qa_assigned),
    short: s.full_name.split(' ').slice(0, 2).join(' '),
  }));
  const h = Math.max(200, rows.length * 34 + 40);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h3 className="mb-2 text-sm font-bold text-ink">Апталық трекер және тапсырмалар орындалуы, %</h3>
          <Bars data={rows} x="short" layout="vertical" height={h} unit="%"
            bars={[{ key: 'week_progress', name: 'Апталық трекер' }, { key: 'tasks_pct', name: 'Тапсырмалар' }]} />
        </Card>
        <Card className="p-4 sm:p-5">
          <h3 className="mb-2 text-sm font-bold text-ink">Оқылған беттер</h3>
          <Bars data={rows} x="short" layout="vertical" height={h} unit=" бет" bars={[{ key: 'pages_total', name: 'Беттер', color: '#9A3A47' }]} />
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line bg-white/60 text-left text-[11px] tracking-wide text-muted uppercase">
                <th className="px-4 py-3 font-semibold">Оқушы</th>
                <th className="px-3 py-3 font-semibold">Апталық трекер</th>
                <th className="px-3 py-3 font-semibold">Тапсырмалар</th>
                <th className="px-3 py-3 font-semibold">Жоспарлар</th>
                <th className="px-3 py-3 font-semibold">Беттер</th>
                <th className="px-3 py-3 font-semibold">Оқу уақыты</th>
                <th className="px-3 py-3 font-semibold">Сұрақ-жауап</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-line/60 last:border-0 hover:bg-brand-50/50">
                  <td className="px-4 py-3">
                    {linkBase ? (
                      <Link href={`${linkBase}/${s.id}`} className="flex items-center gap-2 font-semibold text-ink hover:underline"><Avatar name={s.full_name} size={28} />{s.full_name}</Link>
                    ) : <span className="flex items-center gap-2 font-semibold text-ink"><Avatar name={s.full_name} size={28} />{s.full_name}</span>}
                  </td>
                  <td className="px-3 py-3"><div className="flex items-center gap-2"><ProgressBar value={s.week_progress} className="w-20" /><span className="text-xs font-bold">{s.week_progress == null ? '—' : `${s.week_progress}%`}</span></div></td>
                  <td className="px-3 py-3 text-xs"><b>{s.tasks_pct == null ? '—' : `${s.tasks_pct}%`}</b> <span className="text-muted">({s.tasks_accepted}/{s.tasks_total})</span></td>
                  <td className="px-3 py-3 text-xs"><b>{s.plans_pct == null ? '—' : `${s.plans_pct}%`}</b> <span className="text-muted">({s.plans_done}/{s.plans_total})</span></td>
                  <td className="px-3 py-3 text-xs font-bold">{s.pages_total}</td>
                  <td className="px-3 py-3 text-xs">{minutesLabel(s.minutes_total)}</td>
                  <td className="px-3 py-3 text-xs"><b>{s.qa_pct == null ? '—' : `${s.qa_pct}%`}</b> <span className="text-muted">({s.qa_completed}/{s.qa_assigned})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
