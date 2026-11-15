'use client';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import type { GroupWeekHistory } from '@/lib/types';

export interface PlatformStats {
  students_total: number; students_active: number; curators_total: number; curators_active: number;
  accounts_active: number; accounts_blocked: number; curator_requests_pending: number; student_requests_pending: number;
  active_last_7d: number; avg_week_progress: number | null; tasks_total: number; tasks_accepted: number; tasks_review: number;
  pages_total: number; minutes_total: number; reports_total: number; qa_assigned: number; qa_completed: number;
}

export function usePlatformStats() {
  const q = useLoad(async () => {
    const sb = supabaseBrowser();
    const [s, h] = await Promise.all([sb.rpc('platform_stats'), sb.rpc('group_weekly_history', { p_curator: null, p_weeks: 8 })]);
    return { stats: must(s) as PlatformStats, history: must(h) as GroupWeekHistory[] };
  }, []);
  useRealtime(['curator_requests', 'student_requests'], () => q.reload(true));
  return q;
}
