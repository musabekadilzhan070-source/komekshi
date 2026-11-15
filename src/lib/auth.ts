import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';
import type { Account, Role } from './types';

/** Сервер деңгейінде рөл мен статусты тексеру */
export async function requireRole(role: Role): Promise<Account> {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data: account } = await sb.rpc('my_account');
  if (!account || account.status !== 'active') redirect('/pending');
  if (account.role !== role) redirect('/' + account.role);
  return account as Account;
}
