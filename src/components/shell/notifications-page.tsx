'use client';
import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications, NotificationRow } from './notifications';
import { Card, EmptyState, LoadingBlock, PageHeader, Tabs } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export function NotificationsPage() {
  const { items, unread, loading, markAll } = useNotifications();
  const [tab, setTab] = useState<'unread' | 'all' | 'read'>('unread');
  const list = items.filter((n) => (tab === 'all' ? true : tab === 'unread' ? !n.read_at : !!n.read_at));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Хабарламалар"
        subtitle="Соңғы 30 хабарлама"
        action={unread > 0 && <Button variant="secondary" onClick={markAll}><CheckCheck className="size-4" /> Барлығын оқылды деп белгілеу</Button>}
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'unread', label: 'Оқылмаған', count: unread },
          { value: 'read', label: 'Оқылған' },
          { value: 'all', label: 'Барлығы' },
        ]}
      />
      <Card className="p-2 sm:p-3">
        {loading ? (
          <LoadingBlock />
        ) : list.length === 0 ? (
          <EmptyState icon={Bell} title={tab === 'unread' ? 'Оқылмаған хабарлама жоқ' : 'Хабарлама жоқ'} text="Жаңа оқиғалар болғанда осында көрсетіледі." className="border-0 bg-transparent" />
        ) : (
          <div className="space-y-1">{list.map((n) => <NotificationRow key={n.id} n={n} />)}</div>
        )}
      </Card>
    </div>
  );
}
