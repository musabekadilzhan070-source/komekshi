'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import {
  Bell, BookOpen, CalendarPlus, CheckCircle2, ClipboardList, ListChecks, PlayCircle, RotateCcw, UserPlus, Users, ShieldAlert,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { relativeTime } from '@/lib/date';
import type { Notification } from '@/lib/types';

interface NotifState {
  items: Notification[];
  unread: number;
  loading: boolean;
  reload: () => void;
  markRead: (id: string) => Promise<void>;
  markAll: () => Promise<void>;
}
const Ctx = createContext<NotifState | null>(null);

export function NotificationsProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const sb = supabaseBrowser();

  const reload = useCallback(async () => {
    const [list, count] = await Promise.all([
      sb.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
      sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null),
    ]);
    if (!list.error) setItems(list.data as Notification[]);
    if (!count.error) setUnread(count.count ?? 0);
    setLoading(false);
  }, [sb, userId]);

  useEffect(() => {
    reload();
    const ch = sb
      .channel(`notif-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => reload())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, userId, reload]);

  const markRead = useCallback(async (id: string) => {
    setItems((l) => l.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
    reload();
  }, [sb, reload]);

  const markAll = useCallback(async () => {
    setItems((l) => l.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnread(0);
    await sb.rpc('mark_all_notifications_read');
    reload();
  }, [sb, reload]);

  return <Ctx.Provider value={{ items, unread, loading, reload, markRead, markAll }}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const c = useContext(Ctx);
  if (!c) throw new Error('NotificationsProvider жоқ');
  return c;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  task_assigned: ClipboardList, task_submitted: ClipboardList, task_accepted: CheckCircle2, task_revision: RotateCcw,
  plan_added: CalendarPlus, tracker_published: ListChecks, tracker_updated: ListChecks, qa_video: PlayCircle,
  report_submitted: BookOpen, report_accepted: CheckCircle2, report_revision: RotateCcw,
  student_request: UserPlus, curator_request: UserPlus, request_approved: CheckCircle2,
  student_transferred: Users, curator_changed: Users, account_status: ShieldAlert,
};

export function NotificationRow({ n, compact, onOpen }: { n: Notification; compact?: boolean; onOpen?: () => void }) {
  const router = useRouter();
  const { markRead } = useNotifications();
  const Icon = ICONS[n.type] ?? Bell;
  return (
    <button
      onClick={async () => {
        if (!n.read_at) markRead(n.id);
        onOpen?.();
        if (n.link) router.push(n.link);
      }}
      className={clsx(
        'group flex w-full items-start gap-3 rounded-2xl text-left transition-colors',
        compact ? 'p-2.5 hover:bg-white' : 'p-3.5 hover:bg-navy-50',
        !n.read_at && !compact && 'bg-navy-50/70',
      )}
    >
      <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl', n.read_at ? 'bg-mist text-muted' : 'bg-navy-900 text-white')}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={clsx('block text-[13px] leading-snug', n.read_at ? 'font-medium text-ink/80' : 'font-bold text-navy-900')}>{n.title}</span>
        {n.body && <span className={clsx('mt-0.5 block text-xs text-muted', compact && 'line-clamp-2')}>{n.body}</span>}
        <span className="mt-1 block text-[11px] text-muted/80">{relativeTime(n.created_at)}</span>
      </span>
      {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-navy-700" aria-label="Оқылмаған" />}
    </button>
  );
}

export function BellButton({ href, light }: { href: string; light?: boolean }) {
  const { unread } = useNotifications();
  return (
    <Link
      href={href}
      aria-label={`Хабарламалар${unread ? `, ${unread} оқылмаған` : ''}`}
      className={clsx(
        'relative flex size-10 items-center justify-center rounded-full transition-colors',
        light ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white text-navy-900 ring-1 ring-line hover:bg-navy-50',
      )}
    >
      <Bell className="size-[18px]" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-navy-700 px-1 text-[10px] font-bold text-white ring-2 ring-cream">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
