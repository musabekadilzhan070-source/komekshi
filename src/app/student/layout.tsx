import { requireRole } from '@/lib/auth';
import { AppShell } from '@/components/shell/app-shell';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const account = await requireRole('student');
  return <AppShell account={account}>{children}</AppShell>;
}
