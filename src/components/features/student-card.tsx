'use client';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { relativeTime, shortDate } from '@/lib/date';
import type { StudentOverview } from '@/lib/types';
import { Avatar, Badge, ProgressBar } from '@/components/ui/misc';

export function StudentCard({ s, href }: { s: StudentOverview; href: string }) {
  return (
    <Link href={href} className="card group flex flex-col p-4 transition-shadow hover:shadow-lift sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name={s.full_name} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-navy-900">{s.full_name}</p>
          <p className="text-[11px] text-muted">Тіркелген: {shortDate(s.joined_at ?? s.created_at)}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-navy-300 transition-transform group-hover:translate-x-0.5 group-hover:text-navy-700" />
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="font-semibold text-navy-900">Апталық прогресс</span>
          <span className="font-bold text-navy-900">{s.week_total ? `${s.week_progress}%` : '—'}</span>
        </div>
        <ProgressBar value={s.week_progress} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Badge tone={s.tasks_open ? (s.tasks_overdue ? 'bad' : 'warn') : 'ok'}>{s.tasks_open} орындалмаған тапсырма</Badge>
        {s.tasks_review > 0 && <Badge tone="navy">{s.tasks_review} тексеруде</Badge>}
        {s.status !== 'active' && <Badge>Бұғатталған</Badge>}
      </div>
      <p className={clsx('mt-3 text-[11px]', s.last_active_at && Date.now() - new Date(s.last_active_at).getTime() < 3 * 86400e3 ? 'text-ok' : 'text-muted')}>
        Соңғы белсенділігі: {relativeTime(s.last_active_at)}
      </p>
    </Link>
  );
}
