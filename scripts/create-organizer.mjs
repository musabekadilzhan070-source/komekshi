#!/usr/bin/env node
// Алғашқы (немесе қосымша) организатор аккаунтын қауіпсіз жасау.
// Тек SUPABASE_SERVICE_ROLE_KEY бар сервер/әкімші компьютерінде іске қосылады.
//
//   npm run create-organizer -- --email admin@mail.kz --name "Аты Жөні" [--password "..."]
//
// Құпиясөз берілмесе, кездейсоқ күшті құпиясөз жасалып, экранға бір рет шығады.
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL және SUPABASE_SERVICE_ROLE_KEY орнатылмаған (.env.local).');
  process.exit(1);
}
if (!args.email || !args.name) {
  console.error('Қолданылуы: npm run create-organizer -- --email admin@mail.kz --name "Аты Жөні" [--password "..."]');
  process.exit(1);
}
const password = args.password || randomBytes(12).toString('base64url') + '9a';
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let userId;
const created = await admin.auth.admin.createUser({
  email: args.email, password, email_confirm: true, user_metadata: { full_name: args.name },
});
if (created.error) {
  // Пайдаланушы бар болса — оны организатор етеміз
  const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = list.users.find((u) => u.email?.toLowerCase() === args.email.toLowerCase());
  if (!existing) { console.error('Қате:', created.error.message); process.exit(1); }
  userId = existing.id;
  console.log('Пайдаланушы бұрыннан бар — организатор рөлі беріледі.');
} else {
  userId = created.data.user.id;
}

const upd = await admin.auth.admin.updateUserById(userId, { app_metadata: { role: 'organizer' } });
if (upd.error) { console.error('Қате:', upd.error.message); process.exit(1); }

const { data: profile } = await admin.from('profiles').select('role,status').eq('id', userId).single();
if (profile?.role !== 'organizer' || profile?.status !== 'active') {
  console.error('Профиль организатор болып белгіленбеді. Миграциялар қолданылғанын тексеріңіз.');
  process.exit(1);
}
console.log('✓ Организатор дайын:', args.email);
if (!args.password) console.log('  Уақытша құпиясөз:', password, '\n  Кіргеннен кейін «Профиль» бөлімінде өзгертіңіз.');
