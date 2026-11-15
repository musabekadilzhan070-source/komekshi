import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reply = (error: string | null, status: number) =>
  NextResponse.json(error ? { error } : { ok: true }, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Организатор кабинетіне код арқылы кіру.
 * Код тек дерекқорда хэш түрінде сақталады және тексеріс серверде өтеді;
 * сәтті болса, организаторға кәдімгі Supabase сессиясы беріледі.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ORG_GATE_SECRET;
  const email = process.env.ORGANIZER_EMAIL;
  const password = process.env.ORGANIZER_PASSWORD;
  if (!secret || !email || !password) return reply('not_configured', 503);

  // Тек өз сайтымыздан келген сұраныс
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get('host')) return reply('forbidden', 403);
    } catch {
      return reply('forbidden', 403);
    }
  }

  let code = '';
  try {
    const body = await req.json();
    code = String(body?.code ?? '').trim().slice(0, 32);
  } catch {
    return reply('bad', 400);
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  // IP мекенжайын ашық сақтамаймыз
  const ipHash = createHash('sha256').update(`${ip}|${secret}`).digest('hex').slice(0, 32);

  const gate = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await gate.rpc('org_gate_check', { p_secret: secret, p_ip: ipHash, p_code: code });
  if (error) return reply('server', 500);
  if (data === 'locked') return reply('locked', 429);
  if (data === 'denied' || data === 'disabled') return reply('not_configured', 503);
  if (data !== 'ok') return reply('bad', 401);

  const sb = await supabaseServer();
  const { data: auth, error: signErr } = await sb.auth.signInWithPassword({ email, password });
  if (signErr || !auth.user) return reply('server', 500);
  const { data: profile } = await sb.from('profiles').select('role, status').eq('id', auth.user.id).maybeSingle();
  if (profile?.role !== 'organizer' || profile.status !== 'active') {
    await sb.auth.signOut();
    return reply('not_configured', 503);
  }
  return reply(null, 200);
}
