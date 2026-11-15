'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from './supabase/client';
import { humanError } from './errors';

/** Деректерді жүктеу: loading / error / reload */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const res = await loaderRef.current();
      if (id === seq.current) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(humanError(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);

  return { data, setData, error, loading, reload };
}

/** Supabase жауабынан деректі алу немесе қате лақтыру */
export function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/** Кестедегі өзгерістерге жазылу (RLS бойынша тек рұқсат етілгендері келеді) */
export function useRealtime(tables: string[], onChange: () => void, filter?: string, enabled = true) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(',') + '|' + (filter ?? '');
  useEffect(() => {
    if (!enabled) return;
    const sb = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 250);
    };
    const channel = sb.channel(`rt-${key}-${Math.random().toString(36).slice(2)}`);
    for (const t of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t, ...(filter ? { filter } : {}) }, fire);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
}
