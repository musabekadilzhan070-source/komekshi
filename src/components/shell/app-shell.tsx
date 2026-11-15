'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { LogOut, Menu, UserRound, X, Bell, CalendarDays } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { NAV, type NavItem } from '@/lib/nav';
import { ROLE_LABEL } from '@/lib/labels';
import { longDate, todayISO } from '@/lib/date';
import type { Account } from '@/lib/types';
import { AccountProvider } from './account-context';
import { BellButton, NotificationRow, NotificationsProvider, useNotifications } from './notifications';
import { Avatar } from '@/components/ui/misc';
import { Logo } from './logo';
import { Ornament, OrnamentBand } from '@/components/ui/ornament';

type Badges = Partial<Record<NonNullable<NavItem['badge']>, number>>;

function useBadges(account: Account): Badges {
  const [badges, setBadges] = useState<Badges>({});
  const sb = supabaseBrowser();
  const load = useCallback(async () => {
    if (account.role === 'curator') {
      const [req, rev] = await Promise.all([
        sb.from('student_requests').select('id', { count: 'exact', head: true }).eq('curator_id', account.id).eq('status', 'pending'),
        sb.from('task_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      ]);
      setBadges({ student_requests: req.count ?? 0, reviews: rev.count ?? 0 });
    } else if (account.role === 'organizer') {
      const req = await sb.from('curator_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      setBadges({ curator_requests: req.count ?? 0 });
    }
  }, [sb, account.id, account.role]);

  useEffect(() => {
    if (account.role === 'student') return;
    load();
    const tables = account.role === 'curator' ? ['student_requests', 'task_submissions'] : ['curator_requests'];
    const ch = sb.channel(`badges-${account.id}`);
    tables.forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => load()));
    ch.subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, account.id, account.role, load]);
  return badges;
}

function isActive(path: string, href: string, root: string) {
  return href === root ? path === root : path === href || path.startsWith(href + '/');
}

async function signOut(router: ReturnType<typeof useRouter>) {
  await supabaseBrowser().auth.signOut();
  router.replace('/login');
  router.refresh();
}

export function AppShell({ account, children }: { account: Account; children: React.ReactNode }) {
  return (
    <AccountProvider value={account}>
      <NotificationsProvider userId={account.id}>
        <ShellInner account={account}>{children}</ShellInner>
      </NotificationsProvider>
    </AccountProvider>
  );
}

function ShellInner({ account, children }: { account: Account; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = NAV[account.role];
  const root = '/' + account.role;
  const badges = useBadges(account);

  // Белсенділікті белгілеу (организатор куратор/оқушы белсенділігін көреді)
  useEffect(() => {
    const sb = supabaseBrowser();
    // PostgREST сұранысы «жалқау» — .then() шақырылмаса орындалмайды
    const touch = () => { sb.rpc('touch_activity').then(() => undefined); };
    touch();
    const t = setInterval(touch, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => setMenuOpen(false), [path]);

  const mobileItems = nav.filter((n) => n.mobile).slice(0, 4);

  return (
    <div className="min-h-dvh lg:p-4">
      <div className="mx-auto flex max-w-[1680px] gap-4">
        {/* ---------- Сол жақ навигация (планшет және компьютер) ---------- */}
        <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] shrink-0 flex-col rounded-[28px] bg-navy-900 text-white md:my-4 md:ml-4 md:flex md:w-[84px] lg:my-0 lg:ml-0 lg:w-[248px]">
          <div className="flex h-20 items-center justify-center px-5 lg:justify-start">
            <Link href={root} aria-label="KÓMEKSHI басты бет">
              <Logo light compactOnTablet />
            </Link>
          </div>
          <nav className="scrollbar-none flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Негізгі навигация">
            {nav.map((item) => {
              const active = isActive(path, item.href, root);
              const count = item.badge ? badges[item.badge] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-150',
                    'justify-center lg:justify-start',
                    active ? 'bg-mist text-navy-900 shadow-sm' : 'text-white/75 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <item.icon className={clsx('size-5 shrink-0', active ? 'text-navy-700' : '')} />
                  <span className="hidden truncate lg:inline">{item.label}</span>
                  {!!count && (
                    <span className={clsx(
                      'ml-auto hidden min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold lg:inline',
                      active ? 'bg-navy-700 text-white' : 'bg-sand-300 text-navy-950',
                    )}>{count}</span>
                  )}
                  {!!count && <span className="absolute top-1.5 right-2 size-2 rounded-full bg-sand-300 lg:hidden" />}
                </Link>
              );
            })}
          </nav>
          <OrnamentBand className="mx-auto hidden h-5 px-8 text-mist/[0.14] lg:flex" />
          <div className="space-y-2 p-3">
            <Link
              href={`${root}/profile`}
              title="Профиль"
              className={clsx(
                'flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-white/10 justify-center lg:justify-start',
                path === `${root}/profile` && 'bg-white/10',
              )}
            >
              <Avatar name={account.full_name} size={36} className="!bg-sand-300 !text-navy-950" />
              <span className="hidden min-w-0 lg:block">
                <span className="block truncate text-[13px] font-bold">{account.full_name}</span>
                <span className="block text-[11px] text-white/60">{ROLE_LABEL[account.role]}</span>
              </span>
            </Link>
            <button
              onClick={() => signOut(router)}
              title="Шығу"
              className="flex w-full items-center justify-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:justify-start"
            >
              <LogOut className="size-5" />
              <span className="hidden lg:inline">Шығу</span>
            </button>
          </div>
        </aside>

        {/* ---------- Орталық аймақ ---------- */}
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="min-w-0 flex-1">
            {/* Мобильді жоғарғы панель */}
            <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line/70 bg-mist/90 px-4 py-3 backdrop-blur md:hidden">
              <Link href={root} aria-label="Басты бет"><Logo /></Link>
              <div className="flex items-center gap-2">
                <BellButton href={`${root}/notifications`} />
                <Link href={`${root}/profile`} aria-label="Профиль"><Avatar name={account.full_name} size={40} /></Link>
              </div>
            </header>

            {/* Планшет/компьютер жоғарғы жолағы */}
            <div className="hidden items-center justify-between gap-4 px-6 pt-6 md:flex lg:px-2 lg:pt-2">
              <div className="flex items-center gap-2 text-sm text-muted">
                <CalendarDays className="size-4 text-navy-700" />
                <span className="font-medium">Бүгін: {longDate(todayISO())}</span>
              </div>
              <div className="flex items-center gap-2 xl:hidden">
                <BellButton href={`${root}/notifications`} />
              </div>
            </div>

            <main className="animate-fade-in min-w-0 px-4 pt-5 pb-28 sm:px-6 md:pb-10 lg:px-2 lg:pt-5">{children}</main>
          </div>

          {/* ---------- Оң жақ ақпарат панелі (үлкен экран) ---------- */}
          <RightPanel account={account} root={root} />
        </div>
      </div>

      {/* ---------- Мобильді төменгі навигация ---------- */}
      <nav
        aria-label="Мобильді навигация"
        className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-line bg-cream/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 px-2 pt-1.5 pb-1.5">
          {mobileItems.map((item) => {
            const active = isActive(path, item.href, root);
            const count = item.badge ? badges[item.badge] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[10px] font-semibold"
              >
                <span className={clsx('flex h-8 w-12 items-center justify-center rounded-full transition-colors', active ? 'bg-navy-900 text-white' : 'text-navy-900/70')}>
                  <item.icon className="size-[19px]" />
                </span>
                <span className={clsx('max-w-full truncate', active ? 'text-navy-900' : 'text-muted')}>{item.short ?? item.label}</span>
                {!!count && <span className="absolute top-1 right-3 size-2 rounded-full bg-navy-700" />}
              </Link>
            );
          })}
          <button onClick={() => setMenuOpen(true)} className="flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[10px] font-semibold text-muted">
            <span className="flex h-8 w-12 items-center justify-center rounded-full text-navy-900/70"><Menu className="size-[19px]" /></span>
            Мәзір
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true" aria-label="Мәзір">
          <div className="absolute inset-0 bg-navy-950/45" onClick={() => setMenuOpen(false)} />
          <div className="animate-sheet-in safe-bottom absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[28px] bg-navy-900 p-4 text-white">
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={account.full_name} size={40} className="!bg-sand-300 !text-navy-950" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{account.full_name}</p>
                  <p className="text-xs text-white/60">{ROLE_LABEL[account.role]}</p>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} aria-label="Жабу" className="flex size-9 items-center justify-center rounded-full bg-white/10">
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[...nav, { href: `${root}/notifications`, label: 'Хабарламалар', icon: Bell } as NavItem, { href: `${root}/profile`, label: 'Профиль', icon: UserRound } as NavItem].map((item) => {
                const active = isActive(path, item.href, root);
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx('flex items-center gap-2.5 rounded-2xl px-3 py-3 text-[13px] font-semibold', active ? 'bg-white text-navy-900' : 'bg-white/10 text-white')}
                  >
                    <item.icon className="size-[18px] shrink-0" />
                    <span className="min-w-0 flex-1 leading-tight">{item.label}</span>
                    {!!count && <span className="rounded-full bg-sand-300 px-1.5 text-[10px] font-bold text-navy-950">{count}</span>}
                  </Link>
                );
              })}
            </div>
            <button onClick={() => signOut(router)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm font-semibold">
              <LogOut className="size-4" /> Шығу
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RightPanel({ account, root }: { account: Account; root: string }) {
  const { items, unread, markAll, loading } = useNotifications();
  return (
    <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-[320px] shrink-0 flex-col gap-4 xl:flex">
      <div className="relative overflow-hidden rounded-[28px] bg-navy-900 p-5 text-white">
        <Ornament kind="tuietaban" className="absolute -right-6 -bottom-6 size-32 text-mist/[0.07]" strokeWidth={2} />
        <div className="relative flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-sand-300 uppercase">Бүгін</p>
          <BellButton href={`${root}/notifications`} light />
        </div>
        <p className="mt-2 text-xl font-extrabold leading-tight">{longDate(todayISO())}</p>
        {account.role === 'student' && account.curator && (
          <div className="mt-4 rounded-2xl bg-white/10 p-3">
            <p className="text-[11px] text-white/60">Менің кураторым</p>
            <p className="text-sm font-bold">{account.curator.full_name}</p>
            {account.curator.contact_info && <p className="mt-0.5 text-xs text-white/70">{account.curator.contact_info}</p>}
          </div>
        )}
        {account.role !== 'student' && (
          <p className="mt-3 text-xs leading-relaxed text-white/70">
            {account.role === 'curator' ? 'Оқушыларыңыздың бүгінгі белсенділігін бақылаңыз.' : 'Платформаның жалпы жағдайын бақылаңыз.'}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-[28px] bg-cream p-4 shadow-soft">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm font-bold text-navy-900">
            Хабарламалар {unread > 0 && <span className="ml-1 rounded-full bg-navy-700 px-2 py-0.5 text-[10px] text-white">{unread}</span>}
          </p>
          {unread > 0 && (
            <button onClick={markAll} className="text-[11px] font-semibold text-navy-700 hover:underline">Барлығын оқу</button>
          )}
        </div>
        <div className="scrollbar-none -mx-1 flex-1 space-y-1 overflow-y-auto px-1">
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-2xl" />)}</div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <Bell className="mb-2 size-6 text-sand-300" />
              <p className="text-xs text-muted">Әзірге хабарлама жоқ</p>
            </div>
          ) : (
            items.slice(0, 12).map((n) => <NotificationRow key={n.id} n={n} compact />)
          )}
        </div>
        <Link href={`${root}/notifications`} className="mt-2 rounded-2xl bg-white py-2.5 text-center text-xs font-semibold text-navy-900 ring-1 ring-line hover:bg-navy-50">
          Барлық хабарламалар
        </Link>
      </div>
    </aside>
  );
}
