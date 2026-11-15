// Деректер базасы, бизнес-логика және RLS тесттері.
// Жергілікті Supabase-ке қарсы іске қосылады:  npm run test:db
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
const run = Date.now().toString(36);
const mail = (n) => `${n}.${run}@test.kz`;
const PASS = 'Qwerty!2345';

async function signIn(email) {
  const c = anon();
  const { error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw error;
  return c;
}
async function signUp(meta, email) {
  const c = anon();
  const res = await c.auth.signUp({ email, password: PASS, options: { data: meta } });
  return { c, ...res };
}
const ok = (r, msg) => { if (r.error) throw new Error(`${msg}: ${r.error.message}`); return r.data; };

let org, cur1, cur2, stuA, stuB, stuC;
const ids = {};

before(async () => {
  // Организатор — тек қызметтік кілт арқылы
  const r = await admin.auth.admin.createUser({
    email: mail('org'), password: PASS, email_confirm: true,
    app_metadata: { role: 'organizer' }, user_metadata: { full_name: 'Әлия Организатор' },
  });
  ok(r, 'org create');
  ids.org = r.data.user.id;
  org = await signIn(mail('org'));
});

test('организаторды қарапайым тіркелу арқылы жасау мүмкін емес', async () => {
  const { error } = await signUp({ role: 'organizer', full_name: 'Хакер' }, mail('hacker'));
  assert.ok(error, 'organizer signup must fail');
});

test('куратор тіркелуі → өтініш → организатор қабылдайды', async () => {
  const s1 = await signUp({ role: 'curator', full_name: 'Қанат Құрманов', contact_info: '+7 701 000 00 01' }, mail('cur1'));
  assert.ifError(s1.error);
  const s2 = await signUp({ role: 'curator', full_name: 'Гүлнұр Өмірбек', contact_info: '+7 701 000 00 02' }, mail('cur2'));
  assert.ifError(s2.error);
  ids.cur1 = s1.data.user.id; ids.cur2 = s2.data.user.id;
  cur1 = await signIn(mail('cur1'));
  cur2 = await signIn(mail('cur2'));

  // контактісіз куратор тіркеле алмайды
  const bad = await signUp({ role: 'curator', full_name: 'Контактісіз' }, mail('curbad'));
  assert.ok(bad.error);

  const acc = await cur1.rpc('my_account');
  assert.equal(acc.data.status, 'pending');
  assert.equal(acc.data.request.status, 'pending');

  // күтудегі куратор деректерге қол жеткізе алмайды
  const t = await cur1.from('tasks').insert({ title: 'x', due_date: '2030-01-01' });
  assert.ok(t.error, 'pending curator cannot create tasks');

  // тізімде әлі жоқ
  const list0 = ok(await anon().rpc('list_active_curators'), 'list');
  assert.ok(!list0.some((c) => c.id === ids.cur1));

  // организаторға хабарлама келді
  const n = ok(await org.from('notifications').select('*').eq('type', 'curator_request'), 'notif');
  assert.ok(n.length >= 2);

  // куратор өзін-өзі мақұлдай алмайды
  const reqs = ok(await org.from('curator_requests').select('*').in('curator_id', [ids.cur1, ids.cur2]), 'reqs');
  const self = await cur1.rpc('decide_curator_request', { p_request: reqs.find((x) => x.curator_id === ids.cur1).id, p_approve: true });
  assert.ok(self.error);

  for (const rq of reqs) ok(await org.rpc('decide_curator_request', { p_request: rq.id, p_approve: true }), 'approve');
  const list1 = ok(await anon().rpc('list_active_curators'), 'list');
  assert.ok(list1.some((c) => c.id === ids.cur1 && c.full_name === 'Қанат Құрманов'));
  assert.ok(list1.some((c) => c.id === ids.cur2));
});

test('оқушы тіркелуі → куратор таңдау → куратор қабылдайды/қабылдамайды', async () => {
  // жоқ кураторды таңдауға болмайды
  const bad = await signUp({ role: 'student', full_name: 'Тест', curator_id: '00000000-0000-0000-0000-000000000000' }, mail('sbad'));
  assert.ok(bad.error);

  const a = await signUp({ role: 'student', full_name: 'Аружан Әбілқасым', curator_id: ids.cur1 }, mail('stuA'));
  const b = await signUp({ role: 'student', full_name: 'Бауыржан Ұлықбек', curator_id: ids.cur1 }, mail('stuB'));
  const c = await signUp({ role: 'student', full_name: 'Сәуле Іңкәрова', curator_id: ids.cur2 }, mail('stuC'));
  for (const x of [a, b, c]) assert.ifError(x.error);
  ids.stuA = a.data.user.id; ids.stuB = b.data.user.id; ids.stuC = c.data.user.id;
  stuA = await signIn(mail('stuA')); stuB = await signIn(mail('stuB')); stuC = await signIn(mail('stuC'));

  // күтудегі оқушы жоспар жасай алмайды
  const p = await stuA.from('plans').insert({ student_id: ids.stuA, title: 'x', plan_date: '2030-01-01' });
  assert.ok(p.error);
  assert.equal((await stuA.rpc('my_account')).data.request.status, 'pending');

  // cur2 cur1-дің өтінішін көрмейді және шеше алмайды
  const reqA = ok(await cur1.from('student_requests').select('*').eq('student_id', ids.stuA).single(), 'reqA');
  const vis = ok(await cur2.from('student_requests').select('*').eq('student_id', ids.stuA), 'cur2 view');
  assert.equal(vis.length, 0);
  assert.ok((await cur2.rpc('decide_student_request', { p_request: reqA.id, p_approve: true })).error);
  // оқушы өзін-өзі мақұлдай алмайды
  assert.ok((await stuA.rpc('decide_student_request', { p_request: reqA.id, p_approve: true })).error);
  // профиль статусын тікелей өзгерту мүмкін емес
  const hack = await stuA.from('profiles').update({ status: 'active' }).eq('id', ids.stuA);
  assert.ok(hack.error, 'status change must be blocked');

  // куратор оқушының атын көреді
  const prof = ok(await cur1.from('profiles').select('full_name').eq('id', ids.stuA).single(), 'prof');
  assert.equal(prof.full_name, 'Аружан Әбілқасым');

  ok(await cur1.rpc('decide_student_request', { p_request: reqA.id, p_approve: true }), 'approve A');
  const reqB = ok(await cur1.from('student_requests').select('*').eq('student_id', ids.stuB).single(), 'reqB');
  ok(await cur1.rpc('decide_student_request', { p_request: reqB.id, p_approve: false }), 'reject B');
  const reqC = ok(await cur2.from('student_requests').select('*').eq('student_id', ids.stuC).single(), 'reqC');
  ok(await cur2.rpc('decide_student_request', { p_request: reqC.id, p_approve: true }), 'approve C');

  assert.equal((await stuA.rpc('my_account')).data.status, 'active');
  assert.equal((await stuA.rpc('my_account')).data.curator.full_name, 'Қанат Құрманов');
  assert.equal((await stuB.rpc('my_account')).data.status, 'rejected');
  // қайта шешу мүмкін емес
  assert.ok((await cur1.rpc('decide_student_request', { p_request: reqB.id, p_approve: true })).error);
  // қабылданбаған оқушы деректерге қол жеткізе алмайды
  assert.ok((await stuB.from('plans').insert({ student_id: ids.stuB, title: 'x', plan_date: '2030-01-01' })).error);
  // қайта өтініш
  ok(await stuB.rpc('resubmit_student_request', { p_curator: ids.cur2 }), 'resubmit');
  assert.equal((await stuB.rpc('my_account')).data.status, 'pending');
});

test('жоспарлар: оқушы/куратор, авторлық, құлыптау', async () => {
  const own = ok(await stuA.from('plans').insert({
    student_id: ids.stuA, title: 'Математика қайталау', plan_date: '2030-01-10', start_time: '09:00', end_time: '10:00', priority: 'high',
  }).select().single(), 'own plan');
  assert.equal(own.creator_role, 'student');
  assert.equal(own.created_by, ids.stuA);

  // оқушы creator_role-ды жалған қоя алмайды
  const spoof = ok(await stuA.from('plans').insert({ student_id: ids.stuA, title: 'x', plan_date: '2030-01-10', creator_role: 'curator' }).select().single(), 'spoof');
  assert.equal(spoof.creator_role, 'student');

  // куратор оқушыға жоспар қосады → хабарлама
  const cp = ok(await cur1.from('plans').insert({ student_id: ids.stuA, title: 'Қазақ тілі: эссе', plan_date: '2030-01-11', creator_role: 'student' }).select().single(), 'cur plan');
  assert.equal(cp.creator_role, 'curator');
  const n = ok(await stuA.from('notifications').select('*').eq('type', 'plan_added'), 'n');
  assert.equal(n.length, 1);

  // бөтен куратор жоспар қоса алмайды, көре алмайды
  assert.ok((await cur2.from('plans').insert({ student_id: ids.stuA, title: 'x', plan_date: '2030-01-11' })).error);
  assert.equal(ok(await cur2.from('plans').select('*').eq('student_id', ids.stuA), 'v').length, 0);
  // басқа оқушы көрмейді
  assert.equal(ok(await stuC.from('plans').select('*').eq('student_id', ids.stuA), 'v').length, 0);

  // оқушы куратор жоспарының статусын өзгерте алады, мазмұнын емес
  ok(await stuA.from('plans').update({ status: 'done' }).eq('id', cp.id), 'status');
  assert.ok((await stuA.from('plans').update({ title: 'өзгертілді' }).eq('id', cp.id)).error);
  // оқушы куратор жоспарын өшіре алмайды (RLS үнсіз 0 жол)
  await stuA.from('plans').delete().eq('id', cp.id);
  assert.equal(ok(await stuA.from('plans').select('id').eq('id', cp.id), 'x').length, 1);
  // өз жоспарын өшіре алады
  ok(await stuA.from('plans').delete().eq('id', spoof.id), 'del');
  assert.equal(ok(await stuA.from('plans').select('id').eq('id', spoof.id), 'x').length, 0);
  // куратор өзгерісті көреді
  assert.equal(ok(await cur1.from('plans').select('status').eq('id', cp.id).single(), 'x').status, 'done');
});

test('тапсырмалар: бірнеше оқушыға беру, статус ағыны', async () => {
  // cur1-ге екінші оқушы керек: stuB → cur2-де күтуде. Организатор cur1-ге ауыстырады, cur1 қабылдайды
  ok(await org.rpc('transfer_student', { p_student: ids.stuB, p_curator: ids.cur1 }), 'transfer');
  const rq = ok(await cur1.from('student_requests').select('*').eq('student_id', ids.stuB).eq('status', 'pending').single(), 'rq');
  ok(await cur1.rpc('decide_student_request', { p_request: rq.id, p_approve: true }), 'approve');

  // бөтен оқушыға тапсырма беру мүмкін емес — транзакция толық кері қайтады
  const bad = await cur1.rpc('create_task', {
    p_title: 'x', p_description: null, p_instructions: null, p_start: '2030-01-01', p_due: '2030-01-05', p_priority: 'low',
    p_students: [ids.stuA, ids.stuC],
  });
  assert.ok(bad.error);
  assert.equal(ok(await cur1.from('tasks').select('id').eq('title', 'x'), 'x').length, 0);

  const taskId = ok(await cur1.rpc('create_task', {
    p_title: 'Алгебра: 15 есеп', p_description: 'Квадрат теңдеулер', p_instructions: '1-15 есептер', p_start: '2030-01-01',
    p_due: '2030-01-05', p_priority: 'high', p_students: [ids.stuA, ids.stuB],
  }), 'task');
  ids.task = taskId;
  const subA = ok(await stuA.from('task_submissions').select('*, tasks(*)').eq('task_id', taskId).single(), 'subA');
  assert.equal(subA.status, 'new');
  assert.equal(subA.tasks.title, 'Алгебра: 15 есеп');
  // B-нің тапсыруын A көрмейді
  assert.equal(ok(await stuA.from('task_submissions').select('*').eq('student_id', ids.stuB), 'x').length, 0);

  // оқушы өзі «қабылданды» қоя алмайды
  assert.ok((await stuA.from('task_submissions').update({ status: 'accepted' }).eq('id', subA.id)).error);
  ok(await stuA.from('task_submissions').update({ status: 'pending_review', student_comment: 'Дайын' }).eq('id', subA.id), 'submit');
  const n = ok(await cur1.from('notifications').select('*').eq('type', 'task_submitted'), 'n');
  assert.equal(n.length, 1);

  // куратор оқушының пікірін өзгерте алмайды
  assert.ok((await cur1.from('task_submissions').update({ student_comment: 'x' }).eq('id', subA.id)).error);
  ok(await cur1.from('task_submissions').update({ status: 'needs_revision', curator_comment: '7-есеп қате' }).eq('id', subA.id), 'rev');
  ok(await stuA.from('task_submissions').update({ status: 'pending_review' }).eq('id', subA.id), 'resubmit');
  ok(await cur1.from('task_submissions').update({ status: 'accepted' }).eq('id', subA.id), 'accept');
  assert.ok((await stuA.from('task_submissions').update({ status: 'in_progress' }).eq('id', subA.id)).error);
  const types = ok(await stuA.from('notifications').select('type'), 'n').map((x) => x.type);
  for (const t of ['task_assigned', 'task_revision', 'task_accepted']) assert.ok(types.includes(t), t);
});

test('апталық трекер: прогресс, тек оқушы толтырады', async () => {
  // Платформа Алматы уақытымен жұмыс істейді (kz_today) — аптаны да солай есептейміз
  const kz = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Almaty' }));
  const dow = (kz.getDay() + 6) % 7;
  const monday = new Date(Date.UTC(kz.getFullYear(), kz.getMonth(), kz.getDate() - dow)).toISOString().slice(0, 10);
  const items = [
    { category: 'topic', title: 'Туынды' },
    { category: 'topic', title: 'Интеграл' },
    { category: 'task', task_type: 'test', title: 'Тест №1' },
    { category: 'task', task_type: 'written', title: 'Эссе' },
    { category: 'lesson', title: 'Физика', lesson_date: monday, lesson_time: '15:00' },
  ];
  const tid = ok(await cur1.rpc('create_tracker', { p_title: '1-апта', p_description: null, p_week_start: monday, p_items: items, p_students: [ids.stuA, ids.stuB] }), 'tracker');
  ids.tracker = tid;
  const its = ok(await stuA.from('weekly_tracker_items').select('*').eq('tracker_id', tid).order('sort_order'), 'items');
  assert.equal(its.length, 5);
  // cur2 / stuC трекерді көрмейді
  assert.equal(ok(await stuC.from('weekly_tracker_items').select('*').eq('tracker_id', tid), 'x').length, 0);
  assert.equal(ok(await cur2.from('weekly_trackers').select('*').eq('id', tid), 'x').length, 0);

  for (const it of its.slice(0, 3)) ok(await stuA.from('tracker_progress').upsert({ item_id: it.id, student_id: ids.stuA, done: true }, { onConflict: 'item_id,student_id' }), 'tick');
  ok(await stuA.from('tracker_progress').upsert({ item_id: its[4].id, student_id: ids.stuA, attendance: 'attended' }, { onConflict: 'item_id,student_id' }), 'lesson');
  // куратор оқушының орнына белгі қоя алмайды
  assert.ok((await cur1.from('tracker_progress').upsert({ item_id: its[3].id, student_id: ids.stuA, done: true }, { onConflict: 'item_id,student_id' })).error);
  // stuC тағайындалмаған трекерге белгі қоя алмайды
  assert.ok((await stuC.from('tracker_progress').insert({ item_id: its[3].id, student_id: ids.stuC, done: true })).error);

  const ov = ok(await cur1.from('v_student_overview').select('*').eq('id', ids.stuA).single(), 'ov');
  assert.equal(ov.week_total, 5);
  assert.equal(ov.week_done, 4);
  assert.equal(ov.week_progress, 80);
  // куратор хабарлама алды (бір рет — throttle)
  assert.equal(ok(await cur1.from('notifications').select('*').eq('type', 'tracker_updated').eq('ref_id', ids.stuA), 'n').length, 1);
});

test('кітап оқу есебі және статистика', async () => {
  const r1 = ok(await stuA.from('book_reports').insert({
    student_id: ids.stuA, book_title: 'Абай жолы', publisher: 'Жазушы', pages_read: 40, minutes_spent: 60,
    section: '1-тарау', summary: 'Абайдың балалық шағы', reflection: 'Ұнады', status: 'accepted', curator_comment: 'hack',
  }).select().single(), 'r1');
  assert.equal(r1.status, 'submitted');
  assert.equal(r1.curator_comment, null);
  assert.equal(r1.curator_id, ids.cur1);
  ok(await stuA.from('book_reports').insert({ student_id: ids.stuA, book_title: 'абай жолы ', pages_read: 30, minutes_spent: 45, summary: 'Жалғасы' }), 'r2');
  ok(await stuA.from('book_reports').insert({ student_id: ids.stuA, book_title: 'Көшпенділер', pages_read: 20, minutes_spent: 30, summary: 'Кіріспе' }), 'r3');
  // басқа оқушының атынан жіберу мүмкін емес
  assert.ok((await stuC.from('book_reports').insert({ student_id: ids.stuA, book_title: 'x', pages_read: 1, minutes_spent: 1, summary: 'x' })).error);
  // жіберілген есепті оқушы өзгерте алмайды
  assert.ok((await stuA.from('book_reports').update({ pages_read: 999 }).eq('id', r1.id)).error);
  // куратор тексереді
  assert.ok((await cur1.from('book_reports').update({ pages_read: 1 }).eq('id', r1.id)).error);
  ok(await cur1.from('book_reports').update({ status: 'accepted', curator_comment: 'Жарайсың!' }).eq('id', r1.id), 'accept');
  assert.ok(ok(await stuA.from('notifications').select('type'), 'n').some((x) => x.type === 'report_accepted'));

  const ov = ok(await stuA.from('v_student_overview').select('*').eq('id', ids.stuA).single(), 'ov');
  assert.equal(ov.pages_total, 90);
  assert.equal(ov.minutes_total, 135);
  assert.equal(ov.books_total, 2);
  // оқушы тек өз жолын көреді
  assert.equal(ok(await stuA.from('v_student_overview').select('id'), 'x').length, 1);
  assert.equal(ok(await cur1.from('v_student_overview').select('id'), 'x').length, 2);
  assert.equal(ok(await cur2.from('v_student_overview').select('id').in('id', [ids.stuA, ids.stuB]), 'x').length, 0);

  const hist = ok(await cur1.rpc('student_weekly_history', { p_student: ids.stuA, p_weeks: 4 }), 'hist');
  assert.equal(hist.length, 4);
  assert.equal(hist.at(-1).pages, 90);
  // бөтен куратор тарихты көргенде бос деректер
  const hist2 = ok(await cur2.rpc('student_weekly_history', { p_student: ids.stuA, p_weeks: 4 }), 'hist2');
  assert.equal(hist2.at(-1).pages, 0);

  const ps = ok(await org.rpc('platform_stats'), 'ps');
  assert.ok(ps.pages_total >= 90);
  assert.ok((await cur1.rpc('platform_stats')).error);
});

test('сұрақ-жауап видеосы: storage рұқсаттары және қатысу', async () => {
  const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  const path = `${ids.cur1}/${run}-qa.mp4`;
  // басқа куратордың папкасына жүктеу мүмкін емес
  const wrong = await cur2.storage.from('qa-videos').upload(`${ids.cur1}/evil.mp4`, bytes, { contentType: 'video/mp4' });
  assert.ok(wrong.error);
  // оқушы жүктей алмайды
  assert.ok((await stuA.storage.from('qa-videos').upload(`${ids.stuA}/x.mp4`, bytes, { contentType: 'video/mp4' })).error);
  // рұқсат етілмеген формат
  assert.ok((await cur1.storage.from('qa-videos').upload(`${ids.cur1}/x.exe`, bytes, { contentType: 'application/x-msdownload' })).error);

  ok(await cur1.storage.from('qa-videos').upload(path, bytes, { contentType: 'video/mp4' }), 'upload');
  const v = ok(await cur1.from('qa_videos').insert({
    week_label: '1-апта', week_start: '2030-01-06', title: 'Туынды бойынша сұрақтар', storage_path: path,
    mime_type: 'video/mp4', size_bytes: bytes.length, duration_seconds: 120,
  }).select().single(), 'video');
  ok(await cur1.from('qa_video_assignments').insert([{ video_id: v.id, student_id: ids.stuA }]), 'assign');
  assert.ok((await cur1.from('qa_video_assignments').insert([{ video_id: v.id, student_id: ids.stuC }])).error);

  // A ойната алады, B мен C — жоқ
  ok(await stuA.storage.from('qa-videos').createSignedUrl(path, 600), 'signed A');
  assert.ok((await stuB.storage.from('qa-videos').createSignedUrl(path, 600)).error);
  assert.ok((await stuC.storage.from('qa-videos').createSignedUrl(path, 600)).error);

  const p = ok(await stuA.from('qa_participation').insert({ video_id: v.id, student_id: ids.stuA }).select().single(), 'start');
  ok(await stuA.from('qa_participation').update({ watched_seconds: 120, last_position: 120, completed_at: new Date().toISOString() }).eq('id', p.id), 'complete');
  ok(await stuA.from('qa_participation').update({ watched_seconds: 10 }).eq('id', p.id), 'no decrease');
  const got = ok(await cur1.from('qa_participation').select('*').eq('id', p.id).single(), 'cur sees');
  assert.equal(got.watched_seconds, 120);
  assert.ok(got.completed_at);
  assert.ok((await stuB.from('qa_participation').insert({ video_id: v.id, student_id: ids.stuB })).error);
});

test('организатор: бұғаттау, ауыстыру, өшіру; хабарламалар', async () => {
  ok(await org.rpc('set_account_status', { p_user: ids.stuA, p_status: 'blocked' }), 'block');
  assert.equal(ok(await stuA.from('plans').select('*'), 'x').length, 0, 'blocked student sees nothing');
  assert.ok((await cur1.rpc('set_account_status', { p_user: ids.stuB, p_status: 'blocked' })).error);
  assert.ok((await org.rpc('set_account_status', { p_user: ids.org, p_status: 'blocked' })).error);
  ok(await org.rpc('set_account_status', { p_user: ids.stuA, p_status: 'active' }), 'unblock');
  assert.ok(ok(await stuA.from('plans').select('*'), 'x').length > 0);

  // хабарламаны тек оқылды деп белгілеуге болады
  const n = ok(await stuA.from('notifications').select('*').limit(1).single(), 'n');
  assert.ok((await stuA.from('notifications').update({ title: 'x' }).eq('id', n.id)).error);
  ok(await stuA.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id), 'read');
  assert.ok((await stuA.from('notifications').insert({ user_id: ids.stuB, type: 'x', title: 'spam' })).error);
  assert.equal(ok(await stuB.from('notifications').select('*').eq('user_id', ids.stuA), 'x').length, 0);
  ok(await stuA.rpc('mark_all_notifications_read'), 'all read');

  // ішкі функциялар клиентке жабық
  assert.ok((await stuA.rpc('notify', { p_user: ids.stuB, p_type: 'x', p_title: 'x', p_body: null, p_link: null })).error);

  ok(await org.rpc('transfer_student', { p_student: ids.stuA, p_curator: ids.cur2 }), 'transfer');
  assert.equal(ok(await cur2.from('v_student_overview').select('*').eq('id', ids.stuA).single(), 'x').week_total, 5,
    'жаңа куратор бұрынғы трекерді көреді');
  assert.equal(ok(await cur1.from('plans').select('*').eq('student_id', ids.stuA), 'x').length, 0, 'ескі куратор енді көрмейді');

  const curs = ok(await org.from('v_curator_overview').select('*').in('id', [ids.cur1, ids.cur2]), 'cv');
  assert.equal(curs.length, 2);

  ok(await org.rpc('delete_account', { p_user: ids.stuB }), 'delete');
  assert.equal(ok(await org.from('profiles').select('id').eq('id', ids.stuB), 'x').length, 0);
  assert.ok((await stuA.rpc('delete_account', { p_user: ids.cur1 })).error);
});

test('анонимді пайдаланушы ештеңе көрмейді', async () => {
  const a = anon();
  for (const t of ['profiles', 'plans', 'tasks', 'task_submissions', 'book_reports', 'notifications', 'students']) {
    const r = await a.from(t).select('*').limit(1);
    assert.ok(r.error || r.data.length === 0, t);
  }
  const s = ok(await a.from('platform_settings').select('student_registration_open').single(), 'settings');
  assert.equal(s.student_registration_open, true);
});
