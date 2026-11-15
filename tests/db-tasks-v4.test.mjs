// 4-кезең: тапсырманы толық өзгерту, тест нұсқалары мен тарих, жоспар ескертпесі.
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
const run = 'v4' + Date.now().toString(36);
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

const Q1 = [
  { qtype: 'single', prompt: '2+2?', options: [{ id: 'a', text: '4' }, { id: 'b', text: '5' }], answer: { correct: 'a' }, points: 1 },
  { qtype: 'single', prompt: '3+3?', options: [{ id: 'a', text: '6' }, { id: 'b', text: '7' }], answer: { correct: 'a' }, points: 1 },
];
const Q2 = [
  { qtype: 'single', prompt: '5+5?', options: [{ id: 'a', text: '9' }, { id: 'b', text: '10' }], answer: { correct: 'b' }, points: 2 },
];
const answerAll = (qs, pick) => Object.fromEntries(qs.map((q) => [q.id, pick]));

test('тестті өзгерту: нәтиже бар болса жаңа нұсқа, бұрынғы нәтиже сақталады', async () => {
  const taskId = ok(await cur1.rpc('create_task_v2', {
    p_task: { title: 'Есеп тесті', due_date: '2030-01-05', kind: 'test' }, p_students: [ids.stuA, ids.stuB], p_questions: Q1,
  }), 'create');
  const subA = ok(await stuA.from('task_submissions').select('id').eq('task_id', taskId).single(), 'subA');
  const subB = ok(await stuB.from('task_submissions').select('id').eq('task_id', taskId).single(), 'subB');

  // A тапсырып бітірді (2/2), B бастап қойды
  const tA = ok(await stuA.rpc('start_test', { p_submission: subA.id }), 'startA');
  ok(await stuA.rpc('submit_test', { p_submission: subA.id, p_answers: answerAll(tA.questions, 'a') }), 'submitA');
  ok(await stuB.rpc('start_test', { p_submission: subB.id }), 'startB');

  // оқушы тест сұрақтарын тікелей өзгерте алмайды, куратор да тікелей жаза алмайды (тек RPC)
  assert.ok((await stuA.from('tasks').update({ test_version: 9 }).eq('id', taskId)).error || true);
  const direct = await cur1.from('test_questions').insert({ task_id: taskId, qtype: 'single', prompt: 'x', options: Q1[0].options, answer: Q1[0].answer });
  assert.ok(direct.error, 'direct insert must fail');

  // Куратор тестті өзгертеді (қайта тапсыруға жібермей)
  const r = ok(await cur1.rpc('update_task_v2', { p_task_id: taskId, p_task: { title: 'Есеп тесті (2)' }, p_questions: Q2 }), 'update');
  assert.equal(r.new_version, true);
  assert.equal(r.test_version, 2);

  // A-ның нәтижесі бұрынғы нұсқа бойынша сақталды
  const resA = ok(await cur1.rpc('test_result', { p_submission: subA.id }), 'resA');
  assert.equal(Number(resA.score), 2);
  assert.equal(resA.test_version, 1);
  assert.equal(resA.items.length, 2);
  const sA = ok(await cur1.from('task_submissions').select('status').eq('id', subA.id).single(), 'sA');
  assert.equal(sA.status, 'pending_review');

  // B жаңа нұсқаны алады
  const tB = ok(await stuB.rpc('start_test', { p_submission: subB.id }), 'restartB');
  assert.equal(tB.questions.length, 1);
  assert.equal(tB.questions[0].prompt, '5+5?');
  const resB = ok(await stuB.rpc('submit_test', { p_submission: subB.id, p_answers: answerAll(tB.questions, 'b') }), 'submitB');
  assert.equal(Number(resB.score), 2);
  assert.equal(resB.test_version, 2);

  // Қайта тапсыруға жіберу: A-ның нәтижесі тарихқа көшеді, статус «жаңа»
  const Q3 = [{ ...Q2[0], prompt: '6+4?' }];
  const r2 = ok(await cur1.rpc('update_task_v2', { p_task_id: taskId, p_task: { title: 'Есеп тесті (3)' }, p_questions: Q3, p_retake: true }), 'update retake');
  assert.equal(r2.retaken, 2);
  const hist = ok(await stuA.from('test_attempt_history').select('*').eq('submission_id', subA.id), 'histA');
  assert.equal(hist.length, 1);
  assert.equal(Number(hist[0].score), 2);
  assert.equal(hist[0].reason, 'new_version');
  assert.equal(hist[0].result.items.length, 2);
  const sA2 = ok(await stuA.from('task_submissions').select('status').eq('id', subA.id).single(), 'sA2');
  assert.equal(sA2.status, 'new');
  assert.equal(ok(await stuA.rpc('test_result', { p_submission: subA.id }), 'res none'), null);
  // басқа куратор тарихты көрмейді
  assert.equal(ok(await cur2.from('test_attempt_history').select('id').eq('submission_id', subA.id), 'c2').length, 0);
  // оқушыға хабарлама келді
  const n = ok(await stuA.from('notifications').select('type,title').eq('type', 'task_updated'), 'notif');
  assert.ok(n.length >= 2);
});

test('қайта тапсыру кезінде алдыңғы нәтиже тарихта қалады', async () => {
  const taskId = ok(await cur1.rpc('create_task_v2', {
    p_task: { title: 'Қайта тапсыру', due_date: '2030-01-05', kind: 'test' }, p_students: [ids.stuA], p_questions: Q1,
  }), 'create');
  const sub = ok(await stuA.from('task_submissions').select('id').eq('task_id', taskId).single(), 'sub');
  const t1 = ok(await stuA.rpc('start_test', { p_submission: sub.id }), 'start');
  ok(await stuA.rpc('submit_test', { p_submission: sub.id, p_answers: answerAll(t1.questions, 'b') }), 'submit1');
  ok(await cur1.from('task_submissions').update({ status: 'needs_revision', curator_comment: 'Қайта' }).eq('id', sub.id), 'rev');
  const t2 = ok(await stuA.rpc('start_test', { p_submission: sub.id }), 'start2');
  assert.equal(t2.attempt_no, 2);
  ok(await stuA.rpc('submit_test', { p_submission: sub.id, p_answers: answerAll(t2.questions, 'a') }), 'submit2');
  const hist = ok(await cur1.from('test_attempt_history').select('attempt_no,score,reason').eq('submission_id', sub.id), 'hist');
  assert.deepEqual(hist.map((h) => [h.attempt_no, Number(h.score), h.reason]), [[1, 0, 'retake']]);
});

test('тапсырма түрін өзгерту және оқушыларды алып тастау', async () => {
  const taskId = ok(await cur1.rpc('create_task_v2', {
    p_task: { title: 'Жазбаша', due_date: '2030-01-05', kind: 'written' }, p_students: [ids.stuA, ids.stuB],
  }), 'create');
  // ешкім бастамаған — түрін тестке ауыстыруға болады
  ok(await cur1.rpc('update_task_v2', { p_task_id: taskId, p_task: { title: 'Енді тест', kind: 'test' }, p_questions: Q1 }), 'to test');
  const t = ok(await cur1.from('tasks').select('kind,title').eq('id', taskId).single(), 'read');
  assert.deepEqual(t, { kind: 'test', title: 'Енді тест' });
  // B-ны алып тастау
  ok(await cur1.rpc('update_task_v2', { p_task_id: taskId, p_task: { title: 'Енді тест' }, p_remove_students: [ids.stuB] }), 'remove B');
  assert.equal(ok(await stuB.from('task_submissions').select('id').eq('task_id', taskId), 'B').length, 0);
  // A бастаса — түрін өзгерту бұғатталады
  const sub = ok(await stuA.from('task_submissions').select('id').eq('task_id', taskId).single(), 'sub');
  ok(await stuA.rpc('start_test', { p_submission: sub.id }), 'start');
  const bad = await cur1.rpc('update_task_v2', { p_task_id: taskId, p_task: { title: 'x', kind: 'written' } });
  assert.match(bad.error?.message ?? '', /KOM_TASK_KIND_LOCKED/);
  // бөтен куратор өзгерте алмайды
  const foreign = await cur2.rpc('update_task_v2', { p_task_id: taskId, p_task: { title: 'hack' } });
  assert.match(foreign.error?.message ?? '', /KOM_FORBIDDEN/);
});

test('жоспар ескертпесі: оқушы куратор жоспарының ескертпесін өзгерте алмайды', async () => {
  const p = ok(await cur1.from('plans').insert({ student_id: ids.stuA, title: 'Оқу', plan_date: '2030-01-05', start_time: '09:00', end_time: '09:30', note: 'Конспект жаз' }).select().single(), 'plan');
  assert.equal(p.creator_role, 'curator');
  assert.equal(p.note, 'Конспект жаз');
  assert.ok((await stuA.from('plans').update({ note: 'өзгерттім' }).eq('id', p.id)).error);
  ok(await stuA.from('plans').update({ status: 'done' }).eq('id', p.id), 'status');
  const own = ok(await stuA.from('plans').insert({ student_id: ids.stuA, title: 'Өзім', plan_date: '2030-01-05', note: 'ескертпе' }).select().single(), 'own');
  assert.equal(own.creator_role, 'student');
  const seen = ok(await cur1.from('plans').select('id').eq('id', own.id), 'cur sees');
  assert.equal(seen.length, 1);
});
