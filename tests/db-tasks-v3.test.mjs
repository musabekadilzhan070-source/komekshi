// 3-кезең: тапсырманы өшіру (soft delete), ай/апта кезеңі, организатор архиві.
// Жергілікті Supabase-ке қарсы:  npm run test:db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SERVICE) throw new Error('SUPABASE_ANON_KEY және SUPABASE_SERVICE_ROLE_KEY керек');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const anon = () => createClient(URL, ANON, opts);
const run = 'v3' + Date.now().toString(36);
const mail = (n) => `${n}.${run}@test.kz`;
const PASS = 'Qwerty!2345';
const ok = (r, msg) => { if (r.error) throw new Error(`${msg}: ${r.error.message}`); return r.data; };

async function signIn(email) {
  const c = anon();
  ok(await c.auth.signInWithPassword({ email, password: PASS }), 'signin ' + email);
  return c;
}
async function makeCurator(name) {
  const c = anon();
  const r = ok(await c.auth.signUp({ email: mail(name), password: PASS, options: { data: { role: 'curator', full_name: 'Куратор ' + name, contact_info: '+7 700' } } }), 'signup');
  return r.user.id;
}
async function makeStudent(name, curatorId) {
  const c = anon();
  const r = ok(await c.auth.signUp({ email: mail(name), password: PASS, options: { data: { role: 'student', full_name: 'Оқушы ' + name, curator_id: curatorId } } }), 'signup');
  return r.user.id;
}

let org, cur1, cur2, stuA, stuB, stuC;
const ids = {};

before(async () => {
  const r = ok(await admin.auth.admin.createUser({
    email: mail('org'), password: PASS, email_confirm: true, app_metadata: { role: 'organizer' },
    user_metadata: { full_name: 'Организатор' },
  }), 'org');
  ids.org = r.user.id;
  org = await signIn(mail('org'));
  ids.cur1 = await makeCurator('c1');
  ids.cur2 = await makeCurator('c2');
  for (const c of [ids.cur1, ids.cur2]) {
    const rq = ok(await org.from('curator_requests').select('id').eq('curator_id', c).single(), 'rq');
    ok(await org.rpc('decide_curator_request', { p_request: rq.id, p_approve: true }), 'approve cur');
  }
  cur1 = await signIn(mail('c1'));
  cur2 = await signIn(mail('c2'));
  ids.stuA = await makeStudent('a', ids.cur1);
  ids.stuB = await makeStudent('b', ids.cur1);
  ids.stuC = await makeStudent('c', ids.cur2);
  for (const [cur, s] of [[cur1, ids.stuA], [cur1, ids.stuB], [cur2, ids.stuC]]) {
    const rq = ok(await cur.from('student_requests').select('id').eq('student_id', s).single(), 'srq');
    ok(await cur.rpc('decide_student_request', { p_request: rq.id, p_approve: true }), 'approve stu');
  }
  stuA = await signIn(mail('a'));
  stuB = await signIn(mail('b'));
  stuC = await signIn(mail('c'));
});


test('кезең: ай мен апта күнтізбемен байланысты, қате кезең қабылданбайды', async () => {
  const id = ok(await cur1.rpc('create_task_v2', {
    p_task: { title: 'Қазақ хандығы', due_date: '2030-01-05', kind: 'written', period_year: 2026, period_month: 11, period_week: 3 },
    p_students: [ids.stuA],
  }), 'create period');
  const t = ok(await stuA.from('tasks').select('period_year,period_month,period_week').eq('id', id).single(), 'read');
  assert.deepEqual(t, { period_year: 2026, period_month: 11, period_week: 3 });
  const r = ok(await stuA.rpc('period_week_range', { p_year: 2026, p_month: 11, p_week: 5 }), 'range');
  assert.deepEqual(r[0], { week_start: '2026-11-29', week_end: '2026-11-30' });
  // ақпан 2026 — 28 күн, 5-апта жоқ
  const bad = await cur1.rpc('create_task_v2', {
    p_task: { title: 'x', due_date: '2030-01-05', period_year: 2026, period_month: 2, period_week: 5 }, p_students: [ids.stuA],
  });
  assert.match(bad.error?.message ?? '', /KOM_TASK_PERIOD/);
  // кезең берілмесе, басталу күнінен алынады
  const id2 = ok(await cur1.rpc('create_task_v2', {
    p_task: { title: 'Автокезең', start_date: '2026-12-16', due_date: '2026-12-20' }, p_students: [ids.stuA],
  }), 'auto');
  const t2 = ok(await cur1.from('tasks').select('period_year,period_month,period_week').eq('id', id2).single(), 'read2');
  assert.deepEqual(t2, { period_year: 2026, period_month: 12, period_week: 3 });
  // өзгерту
  ok(await cur1.rpc('update_task_v2', { p_task_id: id2, p_task: { title: 'Автокезең', period_month: 1, period_year: 2027, period_week: 1 } }), 'upd');
  const t3 = ok(await cur1.from('tasks').select('period_year,period_month,period_week').eq('id', id2).single(), 'read3');
  assert.deepEqual(t3, { period_year: 2027, period_month: 1, period_week: 1 });
});

test('өшіру: бір оқушыдан, бәрінен; жасырылады, тарих архивте қалады', async () => {
  const id = ok(await cur1.rpc('create_task_v2', {
    p_task: { title: 'Өшірілетін тест', due_date: '2030-01-05', kind: 'test' }, p_students: [ids.stuA, ids.stuB],
    p_questions: [{ qtype: 'single', prompt: '2+2', options: [{ id: 'a', text: '4' }, { id: 'b', text: '5' }], answer: { correct: 'a' }, points: 1 }],
  }), 'create');
  const subs = ok(await cur1.from('task_submissions').select('id,student_id').eq('task_id', id), 'subs');
  const subA = subs.find((s) => s.student_id === ids.stuA).id;
  const subB = subs.find((s) => s.student_id === ids.stuB).id;
  ok(await stuA.rpc('start_test', { p_submission: subA }), 'startA');
  ok(await stuA.rpc('submit_test', { p_submission: subA, p_answers: {} }), 'submitA');

  // клиент физикалық өшіре де, deleted_at-ты тікелей өзгерте де алмайды
  await cur1.from('tasks').delete().eq('id', id);
  assert.ok(ok(await cur1.from('tasks').select('id').eq('id', id), 'still').length === 1, 'hard delete blocked');
  const direct = await cur1.from('task_submissions').update({ deleted_at: new Date().toISOString() }).eq('id', subA);
  assert.ok(direct.error, 'direct soft delete forbidden');
  // басқа куратор және оқушы өшіре алмайды
  assert.ok((await cur2.rpc('delete_task_assignment', { p_submission: subA })).error);
  assert.ok((await stuA.rpc('delete_task_assignment', { p_submission: subA })).error);
  assert.ok((await stuA.rpc('delete_task', { p_task: id })).error);

  // бір оқушыдан өшіру
  ok(await cur1.rpc('delete_task_assignment', { p_submission: subA }), 'del A');
  assert.equal(ok(await stuA.from('task_submissions').select('id').eq('task_id', id), 'a').length, 0);
  assert.equal(ok(await stuA.from('tasks').select('id').eq('id', id), 'a task').length, 0);
  assert.equal(ok(await stuA.from('test_attempts').select('id').eq('submission_id', subA), 'a att').length, 0);
  assert.equal(ok(await stuB.from('task_submissions').select('id').eq('task_id', id), 'b').length, 1);
  assert.equal(ok(await cur1.from('task_submissions').select('id').eq('task_id', id), 'cur').length, 1);
  const n = ok(await stuA.from('notifications').select('type').eq('type', 'task_removed'), 'notif');
  assert.ok(n.length >= 1, 'student notified');
  // өшірілген тестті қайта бастау мүмкін емес
  assert.ok((await stuA.rpc('submit_test', { p_submission: subA, p_answers: {} })).error);

  // бәрінен өшіру
  assert.equal(ok(await cur1.rpc('delete_task', { p_task: id }), 'del all'), 1);
  assert.equal(ok(await cur1.from('tasks').select('id').eq('id', id), 'gone').length, 0);
  assert.equal(ok(await stuB.from('task_submissions').select('id').eq('task_id', id), 'b gone').length, 0);
  assert.equal(ok(await org.from('tasks').select('id').eq('id', id), 'org live').length, 0);
  assert.ok((await cur1.rpc('update_task_v2', { p_task_id: id, p_task: { title: 'x' } })).error, 'cannot edit deleted');

  // архив: тек организатор, тарих сақталған
  assert.ok((await cur1.rpc('deleted_tasks_archive', {})).error);
  const arch = ok(await org.rpc('deleted_tasks_archive', {}), 'archive');
  const row = arch.find((x) => x.id === id);
  assert.ok(row, 'in archive');
  assert.equal(row.fully_deleted, true);
  assert.equal(row.students.length, 2);
  const a = row.students.find((s) => s.submission_id === subA);
  assert.equal(Number(a.max_score), 1);
  assert.ok(a.finished_at, 'test history kept');
  assert.ok(row.curator_name.includes('c1'));
});

test('өшірілген оқушыны қайта тағайындау қалпына келтіреді', async () => {
  const id = ok(await cur1.rpc('create_task_v2', {
    p_task: { title: 'Қайта беру', due_date: '2030-01-05' }, p_students: [ids.stuA, ids.stuB],
  }), 'create');
  const subA = ok(await cur1.from('task_submissions').select('id').eq('task_id', id).eq('student_id', ids.stuA).single(), 's').id;
  ok(await cur1.rpc('delete_task_assignment', { p_submission: subA }), 'del');
  ok(await cur1.rpc('update_task_v2', { p_task_id: id, p_task: { title: 'Қайта беру' }, p_add_students: [ids.stuA] }), 'readd');
  assert.equal(ok(await stuA.from('task_submissions').select('id').eq('task_id', id), 'back').length, 1);
});
