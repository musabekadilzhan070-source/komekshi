// 2-кезең: тапсырма түрлері, материалдар, тест, оқушы файлдары, организатор коды.
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
const run = 'v2' + Date.now().toString(36);
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

const QUESTIONS = [
  { qtype: 'single', prompt: 'Абай қай жылы туған?', options: [{ id: 'a', text: '1845' }, { id: 'b', text: '1850' }], answer: { correct: 'a' }, points: 2, explanation: 'Абай 1845 жылы туған.' },
  { qtype: 'multiple', prompt: 'Жай сандар', options: [{ id: 'a', text: '2' }, { id: 'b', text: '4' }, { id: 'c', text: '5' }], answer: { correct: ['a', 'c'] }, points: 2 },
  { qtype: 'matching', prompt: 'Астаналарды сәйкестендір', options: { left: [{ id: 'l1', text: 'Қазақстан' }, { id: 'l2', text: 'Қырғызстан' }], right: [{ id: 'r1', text: 'Астана' }, { id: 'r2', text: 'Бішкек' }, { id: 'r3', text: 'Ташкент' }] }, answer: { pairs: { l1: 'r1', l2: 'r2' } }, points: 2 },
  { qtype: 'ordering', prompt: 'Ретімен қой', options: [{ id: 'x', text: 'Бірінші' }, { id: 'y', text: 'Екінші' }, { id: 'z', text: 'Үшінші' }], answer: { order: ['x', 'y', 'z'] }, points: 1 },
  { qtype: 'context', prompt: 'Мәтін бойынша', context_text: 'Ұлы дала елі — Қазақстан.', options: [{ id: 'a', text: 'Иә' }, { id: 'b', text: 'Жоқ' }], answer: { correct: 'a' }, points: 1 },
];

test('тест: құрастыру, жасырын жауаптар, бағалау, қайта тапсыру', async () => {
  // қате сұрақ (дұрыс жауап нұсқалар ішінде жоқ) — бүкіл тапсырма жасалмайды
  const bad = await cur1.rpc('create_task_v2', {
    p_task: { title: 'Қате тест', due_date: '2030-01-05', kind: 'test' }, p_students: [ids.stuA],
    p_questions: [{ qtype: 'single', prompt: 'x', options: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }], answer: { correct: 'zz' } }],
  });
  assert.ok(bad.error, 'invalid key must fail');
  assert.equal(ok(await cur1.from('tasks').select('id').eq('title', 'Қате тест'), 'x').length, 0);
  // бос тест
  assert.ok((await cur1.rpc('create_task_v2', { p_task: { title: 'Бос', due_date: '2030-01-05', kind: 'test' }, p_students: [ids.stuA], p_questions: [] })).error);

  const taskId = ok(await cur1.rpc('create_task_v2', {
    p_task: { title: 'Тарих тесті', description: 'Қазақ тарихы', due_date: '2030-01-05', kind: 'test', time_limit_minutes: 20, priority: 'high' },
    p_students: [ids.stuA, ids.stuB], p_questions: QUESTIONS,
  }), 'create test');
  ids.testTask = taskId;

  // оқушы сұрақтар кестесін (жауаптармен) тікелей оқи алмайды
  assert.equal(ok(await stuA.from('test_questions').select('*').eq('task_id', taskId), 'x').length, 0);
  // куратор өз тестінің жауаптарын көреді, бөтен куратор көрмейді
  assert.equal(ok(await cur1.from('test_questions').select('answer').eq('task_id', taskId), 'x').length, 5);
  assert.equal(ok(await cur2.from('test_questions').select('*').eq('task_id', taskId), 'x').length, 0);

  const subA = ok(await stuA.from('task_submissions').select('id, tasks(kind, time_limit_minutes)').eq('task_id', taskId).single(), 'subA');
  assert.equal(subA.tasks.kind, 'test');
  assert.equal(subA.tasks.time_limit_minutes, 20);

  // тестті «орындалды» деп тікелей белгілеу мүмкін емес
  assert.ok((await stuA.from('task_submissions').update({ status: 'pending_review' }).eq('id', subA.id)).error);
  // нәтиже әлі жоқ
  assert.equal(ok(await stuA.rpc('test_result', { p_submission: subA.id }), 'r0'), null);
  // басқа оқушы бастай алмайды
  assert.ok((await stuB.rpc('start_test', { p_submission: subA.id })).error);
  assert.ok((await stuC.rpc('start_test', { p_submission: subA.id })).error);

  const t = ok(await stuA.rpc('start_test', { p_submission: subA.id }), 'start');
  assert.equal(t.questions.length, 5);
  assert.equal(t.time_limit_minutes, 20);
  for (const q of t.questions) assert.equal(q.answer, undefined, 'answer key must be hidden');
  assert.ok(!JSON.stringify(t).includes('"correct"'));
  assert.equal(ok(await stuA.from('task_submissions').select('status').eq('id', subA.id).single(), 's').status, 'in_progress');
  // аяқталмаған тестте нәтиже/жауап кілті көрінбейді
  const mid = ok(await stuA.rpc('test_result', { p_submission: subA.id }), 'mid');
  assert.equal(mid.finished_at, null);
  assert.equal(mid.items, undefined);

  const byType = Object.fromEntries(t.questions.map((q) => [q.qtype, q.id]));
  const answers = {
    [byType.single]: 'a',                                // 2
    [byType.multiple]: ['c', 'a'],                       // 2 (рет маңызды емес)
    [byType.matching]: { l1: 'r1', l2: 'r3' },           // 1 (жартысы)
    [byType.ordering]: ['x', 'z', 'y'],                  // 0
    [byType.context]: 'a',                               // 1
    'бөгде-кілт': 'hack',
  };
  const res = ok(await stuA.rpc('submit_test', { p_submission: subA.id, p_answers: answers }), 'submit');
  assert.equal(Number(res.score), 6);
  assert.equal(Number(res.max_score), 8);
  assert.equal(res.items.length, 5);
  assert.equal(res.late, false);
  assert.ok(res.duration_seconds >= 0);
  assert.equal(res.items.find((i) => i.qtype === 'single').explanation, 'Абай 1845 жылы туған.');

  const sub = ok(await stuA.from('task_submissions').select('status, submitted_at').eq('id', subA.id).single(), 'sub');
  assert.equal(sub.status, 'pending_review');
  assert.ok(sub.submitted_at);
  const att = ok(await cur1.from('test_attempts').select('*').eq('submission_id', subA.id).single(), 'att');
  assert.equal(Number(att.score), 6);
  assert.ok(!('бөгде-кілт' in att.answers), 'unknown keys are dropped');
  // куратор хабарлама алды
  assert.ok(ok(await cur1.from('notifications').select('type').eq('type', 'task_submitted'), 'n').length >= 1);
  // оқушы B бұл нәтижені көрмейді
  assert.equal(ok(await stuB.from('test_attempts').select('*'), 'x').length, 0);
  assert.ok((await stuB.rpc('test_result', { p_submission: subA.id })).error);

  // қайта тапсыру/қайта бастау мүмкін емес
  assert.ok((await stuA.rpc('submit_test', { p_submission: subA.id, p_answers: answers })).error);
  assert.ok((await stuA.rpc('start_test', { p_submission: subA.id })).error);
  // нәтижелер бар тестті өзгерту енді жаңа нұсқа жасайды (db-tasks-v4 тестін қараңыз)

  // куратор қайта орындауға жібереді → оқушы қайта тапсырады
  ok(await cur1.from('task_submissions').update({ status: 'needs_revision', curator_comment: 'Қайта көр' }).eq('id', subA.id), 'rev');
  const t2 = ok(await stuA.rpc('start_test', { p_submission: subA.id }), 'restart');
  assert.equal(t2.attempt_no, 2);
  const full = Object.fromEntries(t2.questions.map((q) => [q.id, q.qtype]));
  const perfect = {};
  for (const [id, type] of Object.entries(full)) {
    perfect[id] = { single: 'a', multiple: ['a', 'c'], matching: { l1: 'r1', l2: 'r2' }, ordering: ['x', 'y', 'z'], context: 'a' }[type];
  }
  const res2 = ok(await stuA.rpc('submit_test', { p_submission: subA.id, p_answers: perfect }), 'submit2');
  assert.equal(Number(res2.score), 8);
});

test('тапсырма түрлері: жауаптар, кесте, сілтеме, құлыптау', async () => {
  // сілтемесіз сыртқы тапсырма жасалмайды
  assert.ok((await cur1.rpc('create_task_v2', { p_task: { title: 'Сілтеме', due_date: '2030-01-05', kind: 'external_link' }, p_students: [ids.stuA] })).error);
  assert.ok((await cur1.rpc('create_task_v2', { p_task: { title: 'Сілтеме', due_date: '2030-01-05', kind: 'external_link', external_url: 'javascript:alert(1)' }, p_students: [ids.stuA] })).error);
  ok(await cur1.rpc('create_task_v2', { p_task: { title: 'Сілтеме', due_date: '2030-01-05', kind: 'external_link', external_url: 'https://bilimland.kz' }, p_students: [ids.stuA] }), 'link');

  const tableId = ok(await cur1.rpc('create_task_v2', {
    p_task: { title: 'Кесте', due_date: '2030-01-05', kind: 'table', config: { columns: ['Жыл', 'Оқиға'], rows: 3 } },
    p_students: [ids.stuA],
  }), 'table');
  const tsk = ok(await stuA.from('tasks').select('config').eq('id', tableId).single(), 't');
  assert.deepEqual(tsk.config, { columns: ['Жыл', 'Оқиға'], rows: 3 });
  assert.ok((await cur1.rpc('create_task_v2', { p_task: { title: 'Сұрақсыз', due_date: '2030-01-05', kind: 'questions', config: { questions: [] } }, p_students: [ids.stuA] })).error);

  const sub = ok(await stuA.from('task_submissions').select('id').eq('task_id', tableId).single(), 'sub');
  const data = { cells: [['1465', 'Қазақ хандығы'], ['', ''], ['', '']] };
  ok(await stuA.from('task_submissions').update({ answer_data: data, answer_text: 'Түсініктеме' }).eq('id', sub.id), 'save draft');
  // куратор жауапты өзгерте алмайды
  assert.ok((await cur1.from('task_submissions').update({ answer_text: 'x' }).eq('id', sub.id)).error);
  ok(await stuA.from('task_submissions').update({ status: 'pending_review' }).eq('id', sub.id), 'submit');
  // тапсырылғаннан кейін жауапты өзгерту мүмкін емес
  assert.ok((await stuA.from('task_submissions').update({ answer_text: 'өзгерту' }).eq('id', sub.id)).error);
  const seen = ok(await cur1.from('task_submissions').select('answer_data').eq('id', sub.id).single(), 'seen');
  assert.equal(seen.answer_data.cells[0][1], 'Қазақ хандығы');
});

test('материалдар мен оқушы файлдары: storage рұқсаттары', async () => {
  const pdf = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
  const path = `${ids.cur1}/${crypto.randomUUID()}/sabak.pdf`;
  ok(await cur1.storage.from('task-files').upload(path, pdf, { contentType: 'application/pdf' }), 'upload');
  // басқа біреудің папкасына жүктеуге болмайды
  assert.ok((await stuA.storage.from('task-files').upload(`${ids.cur1}/x/hack.pdf`, pdf, { contentType: 'application/pdf' })).error);
  // рұқсат етілмеген формат
  assert.ok((await cur1.storage.from('task-files').upload(`${ids.cur1}/y/a.exe`, new Blob(['MZ'], { type: 'application/x-msdownload' }), { contentType: 'application/x-msdownload' })).error);

  // бөтен материалды тапсырмаға тіркеу мүмкін емес
  assert.ok((await cur2.rpc('create_task_v2', {
    p_task: { title: 'Ұрлық', due_date: '2030-01-05' }, p_students: [ids.stuC],
    p_attachments: [{ storage_path: path, file_name: 'a.pdf', mime_type: 'application/pdf', size_bytes: 10 }],
  })).error);

  const taskId = ok(await cur1.rpc('create_task_v2', {
    p_task: { title: 'Материалмен оқу', due_date: '2030-01-05', kind: 'reading' }, p_students: [ids.stuA],
    p_attachments: [{ storage_path: path, file_name: 'Сабақ.pdf', mime_type: 'application/pdf', size_bytes: 13 }],
  }), 'task');

  const att = ok(await stuA.from('task_attachments').select('*').eq('task_id', taskId), 'att');
  assert.equal(att.length, 1);
  ok(await stuA.storage.from('task-files').createSignedUrl(path, 60), 'student signed url');
  assert.ok((await stuB.storage.from('task-files').createSignedUrl(path, 60)).error, 'unassigned student blocked');
  assert.ok((await stuC.storage.from('task-files').createSignedUrl(path, 60)).error, 'other group blocked');
  assert.equal(ok(await stuB.from('task_attachments').select('*').eq('task_id', taskId), 'x').length, 0);

  // оқушы өз файлын жібереді
  const sub = ok(await stuA.from('task_submissions').select('id').eq('task_id', taskId).single(), 'sub');
  const spath = `${ids.stuA}/${sub.id}/jauap.png`;
  ok(await stuA.storage.from('task-files').upload(spath, new Blob(['png'], { type: 'image/png' }), { contentType: 'image/png' }), 'student upload');
  ok(await stuA.from('submission_files').insert({ submission_id: sub.id, student_id: ids.stuA, storage_path: spath, file_name: 'Жауап.png', mime_type: 'image/png', size_bytes: 3 }), 'sfile');
  // басқа оқушының тапсыруына файл тіркеу мүмкін емес
  assert.ok((await stuB.from('submission_files').insert({ submission_id: sub.id, student_id: ids.stuA, storage_path: `${ids.stuB}/x.png`, file_name: 'x', mime_type: 'image/png', size_bytes: 1 })).error);
  ok(await cur1.storage.from('task-files').createSignedUrl(spath, 60), 'curator reads student file');
  assert.ok((await cur2.storage.from('task-files').createSignedUrl(spath, 60)).error);
  assert.ok((await stuB.storage.from('task-files').createSignedUrl(spath, 60)).error);
  ok(await org.storage.from('task-files').createSignedUrl(spath, 60), 'organizer reads');

  // тапсырылғаннан кейін файлды өшіру мүмкін емес
  ok(await stuA.from('task_submissions').update({ status: 'pending_review' }).eq('id', sub.id), 'submit');
  await stuA.from('submission_files').delete().eq('submission_id', sub.id);
  assert.equal(ok(await cur1.from('submission_files').select('id').eq('submission_id', sub.id), 'x').length, 1);
});

test('организатор коды: тек сервер құпиясымен, шектеу, журнал', async () => {
  const SECRET = 'test-secret-' + run + '-xxxxxxxxxxxxxxxx';
  // клиент кодты орната алмайды
  assert.ok((await stuA.rpc('admin_set_org_gate', { p_code: '111111', p_secret: SECRET })).error);
  assert.ok((await anon().rpc('admin_set_org_gate', { p_code: '111111', p_secret: SECRET })).error);
  ok(await admin.rpc('admin_set_org_gate', { p_code: '483920', p_secret: SECRET }), 'set gate');

  const a = anon();
  const ip = 'ip-' + run;
  assert.equal(ok(await a.rpc('org_gate_check', { p_secret: 'wrong', p_ip: ip, p_code: '483920' }), 'x'), 'denied');
  assert.equal(ok(await a.rpc('org_gate_check', { p_secret: SECRET, p_ip: ip, p_code: '000000' }), 'x'), 'bad');
  assert.equal(ok(await a.rpc('org_gate_check', { p_secret: SECRET, p_ip: ip, p_code: '483920' }), 'x'), 'ok');
  for (let i = 0; i < 4; i++) await a.rpc('org_gate_check', { p_secret: SECRET, p_ip: ip, p_code: '12345' + i });
  assert.equal(ok(await a.rpc('org_gate_check', { p_secret: SECRET, p_ip: ip, p_code: '483920' }), 'x'), 'locked', '5 қате → бұғат');
  assert.equal(ok(await a.rpc('org_gate_check', { p_secret: SECRET, p_ip: ip + '-2', p_code: '483920' }), 'x'), 'ok', 'басқа IP');

  const log = ok(await org.from('activity_log').select('action').in('action', ['organizer_code_ok', 'organizer_code_fail', 'organizer_code_locked']), 'log');
  assert.ok(log.some((l) => l.action === 'organizer_code_fail'));
  assert.ok(log.some((l) => l.action === 'organizer_code_locked'));
  // private схемасы API арқылы ашық емес
  assert.ok((await a.schema('private').from('org_gate').select('*')).error);
});
