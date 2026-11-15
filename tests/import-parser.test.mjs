// Тест импорттау парсері (DOCX/PDF мәтіні және XLSX/CSV кестесі) — браузерсіз тексеру
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLines, parseRows, TEMPLATE_HEADER, TEMPLATE_ROWS } from '../src/lib/test-import.ts';

const L = (text, extra = {}) => ({ text, level: 0, bold: false, images: [], ...extra });
const texts = (q) => q.draft.options.map((o) => o.text);
const correctTexts = (q) => q.draft.options.filter((o) => q.draft.correct.includes(o.id)).map((o) => o.text);

test('мәтін: бір/бірнеше жауап, белгі, «Жауабы» жолы, түсіндірме, ұпай', () => {
  const r = parseLines([
    L('1. Қазақ хандығы қай жылы құрылды?'),
    L('A) 1465'), L('B) 1511'), L('C) 1731'),
    L('Жауабы: A'), L('Түсіндірме: Керей мен Жәнібек'), L('Ұпай: 2'),
    L('2. Қазақ хандарын таңдаңыз'),
    L('*А) Абылай'), L('В) Наполеон'), L('С) Тәуке *'),
    L('3. Ең ұзын өзен'),
    L('а) Нұра'), L('б) Ертіс', { bold: true }), L('в) Есіл'),
  ]);
  assert.equal(r.questions.length, 3);
  const [q1, q2, q3] = r.questions;
  assert.equal(q1.draft.qtype, 'single');
  assert.deepEqual(texts(q1), ['1465', '1511', '1731']);
  assert.deepEqual(correctTexts(q1), ['1465']);
  assert.equal(q1.draft.points, 2);
  assert.equal(q1.draft.explanation, 'Керей мен Жәнібек');
  assert.equal(q1.issues.length, 0);
  assert.equal(q2.draft.qtype, 'multiple');
  assert.deepEqual(correctTexts(q2), ['Абылай', 'Тәуке']);
  assert.deepEqual(correctTexts(q3), ['Ертіс']);
});

test('мәтін: кирилл/латын әріптері, бірнеше жауап жолы', () => {
  const r = parseLines([L('1) Жай сандар'), L('A) 2'), L('B) 4'), L('C) 5'), L('Дұрыс жауап: А, С')]);
  assert.equal(r.questions[0].draft.qtype, 'multiple');
  assert.deepEqual(correctTexts(r.questions[0]), ['2', '5']);
});

test('мәтін: сәйкестендіру (жұптар және «1-B» жауабы), реттеу, мәтін, сурет', () => {
  const img = 'data:image/png;base64,AAAA';
  const r = parseLines([
    L('1. Тұлға мен еңбегін сәйкестендіріңіз'),
    L('Абай — Қара сөздер'), L('Шоқан — Жоңғария очерктері'),
    L('2. Ақын мен шығармасын сәйкестендіріңіз'),
    L('1) Абай'), L('2) Мағжан'),
    L('A) Батыр Баян'), L('B) Қара сөздер'), L('C) Ақбілек'),
    L('Жауабы: 1-B, 2-A'),
    L('3. Оқиғаларды хронологиялық ретпен орналастырыңыз'),
    L('A) Аңырақай шайқасы'), L('B) Қазақ хандығының құрылуы'), L('C) Жеті жарғы'),
    L('Жауабы: B, C, A'),
    L('Мәтін: Аңырақай шайқасы 1730 жылы болды.'),
    L('Қазақ жасағы жеңді.'),
    L('4. Шайқаста кім жеңді?'), L('A) Қазақ жасағы *'), L('B) Жоңғарлар'),
    L('5. Суреттегі түс қандай?', { images: [img] }), L('A) Қызыл'), L('B) Көк'), L('Жауабы: B'),
  ]);
  assert.equal(r.questions.length, 5);
  const [m1, m2, o, c, im] = r.questions;
  assert.equal(m1.draft.qtype, 'matching');
  assert.deepEqual(m1.draft.left.map((x) => x.text), ['Абай', 'Шоқан']);
  assert.equal(m1.draft.right.find((x) => x.id === m1.draft.pairs[m1.draft.left[0].id]).text, 'Қара сөздер');
  assert.equal(m1.issues.length, 0);
  assert.equal(m2.draft.qtype, 'matching');
  assert.equal(m2.draft.right.length, 3);
  assert.equal(m2.draft.right.find((x) => x.id === m2.draft.pairs[m2.draft.left[0].id]).text, 'Қара сөздер');
  assert.equal(m2.draft.right.find((x) => x.id === m2.draft.pairs[m2.draft.left[1].id]).text, 'Батыр Баян');
  assert.equal(m2.issues.length, 0, m2.issues.join());
  assert.equal(o.draft.qtype, 'ordering');
  assert.deepEqual(texts(o), ['Қазақ хандығының құрылуы', 'Жеті жарғы', 'Аңырақай шайқасы']);
  assert.equal(c.draft.qtype, 'context');
  assert.match(c.draft.context_text, /1730.*\n?.*жеңді/s);
  assert.deepEqual(correctTexts(c), ['Қазақ жасағы']);
  assert.equal(im.draft.qtype, 'image');
  assert.deepEqual(im.images, [img]);
  assert.deepEqual(correctTexts(im), ['Көк']);
});

test('түсініксіз жерде болжам жасамайды: жауапсыз сұрақ пен оқылмаған жолдар белгіленеді', () => {
  const r = parseLines([
    L('Тест: 9-сынып'),
    L('1. Жауабы жоқ сұрақ'), L('A) бір'), L('B) екі'),
    L('2. Реттеңіз ретімен'), L('A) x'), L('B) y'),
    L('3. Жауабы қате'), L('A) a'), L('B) b'), L('Жауабы: F'),
  ]);
  assert.deepEqual(r.unread, ['Тест: 9-сынып']);
  assert.match(r.questions[0].issues.join(), /Дұрыс жауап анықталмады/);
  assert.equal(r.questions[0].draft.correct.length, 0);
  assert.match(r.questions[1].issues.join(), /Дұрыс рет көрсетілмеген/);
  assert.match(r.questions[2].issues.join(), /табылмады/);
  assert.equal(parseLines([L('жай мәтін')]).fatal?.length > 0, true);
});

test('Word авто-нөмірлеу: 1-деңгей сұрақ, 2-деңгей нұсқа', () => {
  const r = parseLines([
    L('Абай қай жылы туған?', { level: 1 }), L('1845', { level: 2, bold: true }), L('1850', { level: 2 }),
    L('Шоқан қай жылы туған?', { level: 1 }), L('1835', { level: 2 }), L('1840', { level: 2 }), L('Жауабы: A'),
  ]);
  assert.equal(r.questions.length, 2);
  assert.deepEqual(correctTexts(r.questions[0]), ['1845']);
  assert.deepEqual(correctTexts(r.questions[1]), ['1835']);
});

test('кесте: үлгі толық оқылады, барлық түр және жауаптар дұрыс', () => {
  const r = parseRows([TEMPLATE_HEADER, ...TEMPLATE_ROWS]);
  assert.equal(r.fatal, undefined);
  assert.equal(r.questions.length, 5);
  for (const q of r.questions) assert.deepEqual(q.issues, [], q.source + ': ' + q.issues.join());
  const [s, m, mt, o, c] = r.questions;
  assert.deepEqual(correctTexts(s), ['1465']);
  assert.equal(m.draft.qtype, 'multiple');
  assert.deepEqual(correctTexts(m), ['Абылай', 'Тәуке']);
  assert.equal(mt.draft.qtype, 'matching');
  assert.equal(mt.draft.left.length, 3);
  assert.equal(o.draft.qtype, 'ordering');
  assert.deepEqual(texts(o), ['Қазақ хандығының құрылуы', 'Тәуке ханның «Жеті жарғысы»', 'Аңырақай шайқасы']);
  assert.equal(c.draft.qtype, 'context');
  assert.equal(s.draft.points, 1);
  assert.equal(m.draft.points, 2);
});

test('кесте: бағандары танылмаса — қате, нұсқа нөмірі мен мәтінімен жауап', () => {
  assert.ok(parseRows([['a', 'b'], ['c', 'd']]).fatal);
  const r = parseRows([
    ['Вопрос', 'Вариант 1', 'Вариант 2', 'Вариант 3', 'Ответ'],
    ['Столица?', 'Астана', 'Алматы', 'Шымкент', '1'],
    ['Ең биік тау?', 'Хан Тәңірі', 'Эверест', '', 'Эверест'],
    ['Белгісіз', 'x', 'y', '', ''],
  ]);
  assert.deepEqual(correctTexts(r.questions[0]), ['Астана']);
  assert.deepEqual(correctTexts(r.questions[1]), ['Эверест']);
  assert.match(r.questions[2].issues.join(), /Дұрыс жауап анықталмады/);
});
