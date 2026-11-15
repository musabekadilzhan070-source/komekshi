'use client';
import { createContext, useContext } from 'react';
import type { Account } from '@/lib/types';

const Ctx = createContext<Account | null>(null);
export const AccountProvider = Ctx.Provider;
export function useAccount(): Account {
  const a = useContext(Ctx);
  if (!a) throw new Error('AccountProvider жоқ');
  return a;
}
