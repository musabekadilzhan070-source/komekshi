// Толық пайдаланушы сценарийі (UI арқылы): тіркелу → өтініш → мақұлдау → кабинеттер.
// Іске қосу: BASE_URL=http://localhost:3000 SHOTS=/path node tests/e2e-flow.mjs
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || './.shots';
const ORG = { email: process.env.ORG_EMAIL || 'admin@komekshi.kz', password: process.env.ORG_PASSWORD || 'Komekshi2026' };
const run = Date.now().toString(36).slice(-5);
const CUR = { name: 'Қанат Құрманғазы', email: `kanat.${run}@mail.kz`, password: 'Kurator2026', contact: '+7 701 555 12 34' };
const STU = { name: 'Аружан Әбілқасымова', email: `aruzhan.${run}@mail.kz`, password: 'Oqushy2026' };
const STU2 = { name: 'Нұрсұлтан Өтегенов', email: `nursultan.${run}@mail.kz`, password: 'Oqushy2026' };

const browser = await chromium.launch();
const errors = [];
async function ctx(mobile = false) {
  const c = await browser.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`${p.url()}: ${m.text()}`));
  return { c, p };
}
const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
const toast = async (p, re) => { await p.getByText(re).first().waitFor({ timeout: 10000 }); };
async function login(p, u) {
  await p.goto(`${BASE}/login`);
  await p.getByLabel('Электронды пошта').fill(u.email);
  await p.getByLabel('Құпиясөз', { exact: true }).fill(u.password);
  await p.getByRole('button', { name: 'Кіру' }).click();
}

async function step(name, fn) {
  const t = Date.now();
  try { await fn(); console.log(`✓ ${name} (${Date.now() - t} мс)`); }
  catch (e) {
    console.log(`✗ ${name}: ${e.message.split('\n')[0]}`);
    for (const [k, v] of Object.entries({ A, O, S, S2 })) if (v?.p) await v.p.screenshot({ path: `${SHOTS}/fail-${k}.png` }).catch(() => {});
    throw e;
  }
}

let O, S, S2;
const A = await ctx();
await step('Басты бет ашылады, қазақ әріптері', async () => {
  await A.p.goto(BASE);
  await A.p.getByText('Әр оқушыға жеке назар').waitFor();
  await shot(A.p, '01-landing');
});

await step('Куратор тіркеледі → күту беті', async () => {
  await A.p.goto(`${BASE}/register`);
  await A.p.getByRole('button', { name: /^Куратор/ }).click();
  await A.p.getByRole('button', { name: /Жалғастыру/ }).click();
  await A.p.getByLabel(/Аты-жөні/).fill(CUR.name);
  await A.p.getByLabel(/Электронды пошта/).fill(CUR.email);
  await A.p.getByLabel(/^Құпиясөз/).first().fill(CUR.password);
  await A.p.getByLabel(/Құпиясөзді қайталаңыз/).fill(CUR.password);
  await A.p.getByLabel(/Байланыс ақпараты/).fill(CUR.contact);
  await shot(A.p, '02-register-curator');
  await A.p.getByRole('button', { name: /Өтініш жіберу/ }).click();
  await A.p.waitForURL('**/pending');
  await A.p.getByText('Өтінішіңіз қарастырылуда').waitFor();
  await shot(A.p, '03-pending-curator');
  // күтудегі куратор кабинетке кіре алмайды
  await A.p.goto(`${BASE}/curator`);
  await A.p.waitForURL('**/pending');
});

O = await ctx();
await step('Организатор куратор өтінішін қабылдайды', async () => {
  await login(O.p, ORG);
  await O.p.waitForURL('**/organizer');
  await O.p.goto(`${BASE}/organizer/requests`);
  await O.p.getByText(CUR.name, { exact: true }).first().waitFor();
  await shot(O.p, '04-organizer-requests');
  await O.p.getByRole('button', { name: 'Қабылдау' }).first().click();
  await O.p.getByRole('dialog').getByRole('button', { name: 'Қабылдау' }).click();
  await toast(O.p, /Куратор белсендірілді/);
});

await step('Куратордың күту беті автоматты жаңарады → кабинет', async () => {
  await A.p.getByText('Өтінішіңіз қабылданды!').waitFor({ timeout: 25000 });
  await A.p.getByRole('button', { name: /Кабинетке өту/ }).click();
  await A.p.waitForURL('**/curator');
  await A.p.getByText(/Қайырлы күн/).waitFor();
  await shot(A.p, '05-curator-home-empty');
});

S = await ctx();
await step('Оқушы тіркеледі → куратор таңдайды → өтініш', async () => {
  await S.p.goto(`${BASE}/register`);
  await S.p.getByRole('button', { name: /^Оқушы/ }).click();
  await S.p.getByRole('button', { name: /Жалғастыру/ }).click();
  await S.p.getByLabel(/Аты-жөні/).fill(STU.name);
  await S.p.getByLabel(/Электронды пошта/).fill(STU.email);
  await S.p.getByLabel(/^Құпиясөз/).first().fill(STU.password);
  await S.p.getByLabel(/Құпиясөзді қайталаңыз/).fill(STU.password);
  await S.p.getByRole('button', { name: /Куратор таңдау/ }).click();
  await S.p.getByRole('radio', { name: new RegExp(CUR.name) }).click();
  await shot(S.p, '06-register-pick-curator');
  await S.p.getByRole('button', { name: /Өтініш жіберу/ }).click();
  await S.p.waitForURL('**/pending');
  await S.p.getByText(CUR.name).first().waitFor();
  await S.p.goto(`${BASE}/student`);
  await S.p.waitForURL('**/pending');
});

S2 = await ctx(true);
await step('Екінші оқушы (телефон) тіркеледі', async () => {
  await S2.p.goto(`${BASE}/register`);
  await S2.p.getByRole('button', { name: /^Оқушы/ }).click();
  await S2.p.getByRole('button', { name: /Жалғастыру/ }).click();
  await S2.p.getByLabel(/Аты-жөні/).fill(STU2.name);
  await S2.p.getByLabel(/Электронды пошта/).fill(STU2.email);
  await S2.p.getByLabel(/^Құпиясөз/).first().fill(STU2.password);
  await S2.p.getByLabel(/Құпиясөзді қайталаңыз/).fill(STU2.password);
  await S2.p.getByRole('button', { name: /Куратор таңдау/ }).click();
  await S2.p.getByRole('radio', { name: new RegExp(CUR.name) }).click();
  await S2.p.getByRole('button', { name: /Өтініш жіберу/ }).click();
  await S2.p.waitForURL('**/pending');
  await shot(S2.p, '07-mobile-pending');
});

await step('Куратор өтініштерді көреді: біреуін қабылдайды, біреуін қабылдамайды', async () => {
  await A.p.goto(`${BASE}/curator/requests`);
  await A.p.getByText(STU.name, { exact: true }).first().waitFor();
  await shot(A.p, '08-curator-requests');
  const card = (n) => A.p.locator('.card').filter({ hasText: n });
  await card(STU.name).getByRole('button', { name: 'Қабылдау' }).click();
  await A.p.getByRole('dialog').getByRole('button', { name: 'Қабылдау' }).click();
  await toast(A.p, /тобыңызға қабылданды/);
  await card(STU2.name).getByRole('button', { name: 'Қабылдамау' }).click();
  await A.p.getByRole('dialog').getByRole('button', { name: 'Қабылдамау' }).click();
  await toast(A.p, /Өтініш қабылданбады/);
});

await step('Қабылданбаған оқушы статусты көреді, қайта жібере алады', async () => {
  await S2.p.getByText('Өтінішіңіз қабылданбады').waitFor({ timeout: 25000 });
  await S2.p.getByText('Қайта өтініш жіберу').waitFor();
  await shot(S2.p, '09-mobile-rejected');
});

await step('Оқушы кабинеті ашылады', async () => {
  await S.p.getByText('Өтінішіңіз қабылданды!').waitFor({ timeout: 25000 });
  await S.p.goto(`${BASE}/student`);
  await S.p.getByText(/Сәлем, Аружан/).waitFor();
  await S.p.getByText(CUR.name).first().waitFor();
  await shot(S.p, '10-student-home-empty');
  // басқа кабинетке кіре алмайды
  await S.p.goto(`${BASE}/curator`);
  await S.p.waitForURL('**/student');
  await S.p.goto(`${BASE}/organizer/students`);
  await S.p.waitForURL('**/student');
});

await step('Оқушы жоспар құрады', async () => {
  await S.p.goto(`${BASE}/student/plan`);
  await S.p.getByRole('button', { name: /^Жоспар$/ }).click();
  await S.p.getByLabel(/Жоспар атауы/).fill('Алгебра: квадрат теңдеулер');
  await S.p.getByLabel(/Тапсырма сипаттамасы/).fill('Оқулықтың 45–47 беттері, 10 есеп');
  await S.p.getByLabel('Басталуы').fill('16:00');
  await S.p.getByLabel('Аяқталуы').fill('17:30');
  await S.p.getByLabel('Маңыздылығы').selectOption('high');
  await S.p.getByRole('dialog').getByRole('button', { name: 'Сақтау' }).click();
  await toast(S.p, /Жоспар қосылды/);
  await S.p.getByText('Алгебра: квадрат теңдеулер').first().waitFor();
});

await step('Куратор оқушы күнтізбесіне жоспар қосады → оқушыда пайда болады', async () => {
  await A.p.goto(`${BASE}/curator/students`);
  await A.p.getByText(STU.name, { exact: true }).first().click();
  await A.p.waitForURL('**/curator/students/**');
  await A.p.getByText('Алгебра: квадрат теңдеулер').first().waitFor();
  await A.p.getByRole('button', { name: /^Жоспар$/ }).click();
  await A.p.getByLabel(/Жоспар атауы/).fill('Қазақ әдебиеті: Абай өлеңдері');
  await A.p.getByRole('dialog').getByRole('button', { name: 'Сақтау' }).click();
  await toast(A.p, /оқушының күнтізбесіне қосылды/);
  await shot(A.p, '11-curator-student-plan');
  await S.p.locator('main').getByText('Қазақ әдебиеті: Абай өлеңдері').first().waitFor({ timeout: 10000 });
  await S.p.locator('main').getByText('Куратор жасаған', { exact: true }).first().waitFor();
  await shot(S.p, '12-student-plan');
});

await step('Куратор тапсырма береді', async () => {
  await A.p.goto(`${BASE}/curator/tasks`);
  await A.p.getByRole('button', { name: /Жаңа тапсырма/ }).click();
  await A.p.getByLabel(/Тапсырма атауы/).fill('Геометрия: үшбұрыштар');
  await A.p.getByLabel(/Толық сипаттамасы/).fill('Үшбұрыш теңдігінің белгілері');
  await A.p.getByLabel(/Орындау нұсқаулығы/).fill('1) Теорияны оқу 2) 12 есеп шығару');
  await A.p.getByRole('button', { name: 'Барлығын таңдау' }).click();
  await A.p.getByRole('dialog').getByRole('button', { name: /Тапсырма беру/ }).click();
  await toast(A.p, /Тапсырма 1 оқушыға берілді/);
});

await step('Оқушы тапсырманы орындап жібереді → куратор қабылдайды', async () => {
  await S.p.goto(`${BASE}/student/tasks`);
  await S.p.locator('main').getByText('Геометрия: үшбұрыштар').first().click();
  await S.p.getByLabel(/түсініктеме/).fill('Барлық 12 есепті шығардым');
  await shot(S.p, '13-student-task-modal');
  await S.p.getByRole('button', { name: 'Орындалды' }).click();
  await toast(S.p, /тексеруіне жіберілді/);
  await A.p.goto(`${BASE}/curator/tasks`);
  await A.p.locator('main').getByText('Геометрия: үшбұрыштар').first().click();
  await A.p.getByText('Барлық 12 есепті шығардым').waitFor();
  await A.p.getByLabel('Оқушыға пікір').fill('Жарайсың!');
  await A.p.getByRole('dialog').getByRole('button', { name: 'Қабылдау' }).click();
  await toast(A.p, /Тапсырма қабылданды/);
});

await step('Куратор апталық трекер құрады және тағайындайды', async () => {
  await A.p.goto(`${BASE}/curator/tracker`);
  await A.p.getByRole('button', { name: /Жаңа трекер/ }).first().click();
  const d = A.p.getByRole('dialog');
  await d.getByLabel(/Трекер атауы/).fill('Қараша, 3-апта');
  await d.getByPlaceholder('Тақырып атауы').first().fill('Квадрат теңдеулер');
  await d.getByPlaceholder('Тапсырма атауы').first().fill('Тест: алгебра');
  await d.getByPlaceholder('Сабақ атауы').first().fill('Физика сабағы');
  await d.getByRole('button', { name: 'Қосу' }).first().click();
  await d.getByPlaceholder('Тақырып атауы').nth(1).fill('Виет теоремасы');
  await d.getByRole('button', { name: 'Барлығын таңдау' }).click();
  await shot(A.p, '14-tracker-builder');
  await d.getByRole('button', { name: /Сақтау және жариялау/ }).click();
  await toast(A.p, /оқушыға жарияланды/);
});

await step('Оқушы трекерді толтырады → прогресс 75% → куратор тікелей көреді', async () => {
  await S.p.goto(`${BASE}/student/tracker`);
  await S.p.getByText('Квадрат теңдеулер').waitFor();
  await S.p.getByRole('button', { name: 'Орындалды деп белгілеу' }).first().click();
  await S.p.waitForTimeout(400);
  await S.p.getByRole('button', { name: 'Орындалды деп белгілеу' }).first().click();
  await S.p.waitForTimeout(400);
  await S.p.getByRole('radio', { name: 'Қатысты' }).click();
  await S.p.getByText('Прогресс — 75%').waitFor();
  await shot(S.p, '15-student-tracker');
  await A.p.getByText(/3\/4 · 75%/).waitFor({ timeout: 10000 });
  await shot(A.p, '16-curator-tracker-live');
});

await step('Оқушы кітап оқу есебін жібереді → куратор қабылдайды', async () => {
  await S.p.goto(`${BASE}/student/reading`);
  await S.p.getByRole('button', { name: /Есеп беру/ }).click();
  const d = S.p.getByRole('dialog');
  await d.getByLabel(/Кітаптың атауы/).fill('Абай жолы');
  await d.getByLabel(/Баспасы/).fill('Жазушы');
  await d.getByLabel(/Оқылған беттер/).fill('42');
  await d.getByLabel('Сағат').fill('1');
  await d.getByLabel(/Минут/).fill('15');
  await d.getByLabel(/Оқылған бөлім/).fill('1-том, 1–2 тараулар');
  await d.getByLabel(/Қысқаша мазмұны/).fill('Абайдың бала кезі, Құнанбаймен қарым-қатынасы.');
  await d.getByLabel(/түсінгеніңіз/).fill('Ұлы ақынның қалыптасуы әсер етті.');
  await d.getByRole('button', { name: /Есепті жіберу/ }).click();
  await toast(S.p, /кураторға жіберілді/);
  await S.p.getByText('42', { exact: true }).first().waitFor();
  await A.p.goto(`${BASE}/curator/reports`);
  await A.p.locator('main').getByText('Абай жолы').first().click();
  await A.p.getByRole('dialog').getByRole('button', { name: 'Қабылдау' }).click();
  await toast(A.p, /Есеп қабылданды/);
});

await step('Куратор видео жүктейді → оқушы ойнатады → «аяқталды» → куратор қатысуды көреді', async () => {
  await A.p.goto(`${BASE}/curator/videos`);
  await A.p.getByRole('button', { name: /Видео жүктеу/ }).first().click();
  const d = A.p.getByRole('dialog');
  await d.locator('input[type=file]').setInputFiles(process.env.QA_VIDEO || './tests/fixtures/qa-test.webm');
  await d.getByText(/0:06/).waitFor();
  await d.getByLabel(/Апта атауы/).fill('Қараша, 3-апта');
  await d.getByLabel(/Видеоның тақырыбы/).fill('Квадрат теңдеулер бойынша сұрақтар');
  await d.getByRole('button', { name: 'Барлығын таңдау' }).click();
  await d.getByRole('button', { name: /^Жүктеу$/ }).click();
  await toast(A.p, /Видео жүктелді/);
  await S.p.goto(`${BASE}/student/qa`);
  await S.p.locator('main').getByText('Квадрат теңдеулер бойынша сұрақтар').waitFor();
  await shot(S.p, '17a-student-qa-card');
  await S.p.locator('main').getByRole('button', { name: /Бастау/ }).click();
  await S.p.getByRole('dialog').getByRole('button', { name: 'Ойнату' }).first().click();
  await S.p.getByText('Сұрақ-жауап аяқталды').waitFor({ timeout: 20000 });
  await shot(S.p, '17b-student-qa-finished');
  await S.p.getByRole('dialog').getByRole('button', { name: 'Жабу' }).last().click();
  await A.p.getByRole('button', { name: 'Қатысу' }).click();
  await A.p.getByRole('dialog').getByText('Қатысты').waitFor({ timeout: 10000 });
  await shot(A.p, '17c-curator-qa-participation');
  await A.p.getByRole('dialog').getByRole('button', { name: 'Жабу' }).click();
});

await step('Хабарламалар келеді (оқушыда)', async () => {
  await S.p.goto(`${BASE}/student/notifications`);
  await S.p.getByText('Куратор есепті қабылдады').first().waitFor({ timeout: 10000 });
  await S.p.getByText('Жаңа тапсырма берілді').first().waitFor();
  await S.p.getByText('Апталық трекер жарияланды').first().waitFor();
  await shot(S.p, '17-student-notifications');
});

await step('Куратор статистикасы мен басты беті', async () => {
  await A.p.goto(`${BASE}/curator`);
  await A.p.getByText('Апталық орташа прогресс').waitFor();
  await A.p.waitForTimeout(800);
  await shot(A.p, '18-curator-home');
  await A.p.goto(`${BASE}/curator/stats`);
  await A.p.getByText(STU.name).first().waitFor();
  await A.p.waitForTimeout(800);
  await shot(A.p, '19-curator-stats');
});

await step('Оқушы басты беті мен нәтижелері (деректермен)', async () => {
  await S.p.goto(`${BASE}/student`);
  await S.p.getByText('Апталық прогресс').first().waitFor();
  await S.p.waitForTimeout(800);
  await shot(S.p, '20-student-home');
  await S.p.goto(`${BASE}/student/results`);
  await S.p.waitForTimeout(1200);
  await shot(S.p, '21-student-results');
});

await step('Организатор: басты бет, оқушылар, статистика, бұғаттау', async () => {
  await O.p.goto(`${BASE}/organizer`);
  await O.p.getByText('Жалпы оқушылар').waitFor();
  await O.p.waitForTimeout(800);
  await shot(O.p, '22-organizer-home');
  await O.p.goto(`${BASE}/organizer/students`);
  await O.p.getByText(STU.name, { exact: true }).first().waitFor();
  await shot(O.p, '23-organizer-students');
  await O.p.locator('.card').filter({ hasText: STU.name }).getByRole('button', { name: 'Бұғаттау' }).click();
  await O.p.getByRole('dialog').getByRole('button', { name: 'Бұғаттау' }).click();
  await toast(O.p, /бұғатталды/);
  await S.p.goto(`${BASE}/student`);
  await S.p.waitForURL('**/pending');
  await S.p.getByText('Аккаунт уақытша бұғатталған').waitFor();
  await O.p.getByRole('tab', { name: /Бұғатталған/ }).click();
  await O.p.locator('.card').filter({ hasText: STU.name }).getByRole('button', { name: 'Белсендіру' }).click();
  await O.p.getByRole('dialog').getByRole('button', { name: 'Белсендіру' }).click();
  await toast(O.p, /белсендірілді/);
  await O.p.goto(`${BASE}/organizer/stats`);
  await O.p.waitForTimeout(1000);
  await shot(O.p, '24-organizer-stats');
});

await step('Мобильді нұсқа: оқушы кабинеті', async () => {
  const M = await ctx(true);
  await login(M.p, STU);
  await M.p.waitForURL('**/student');
  await M.p.waitForTimeout(800);
  await shot(M.p, '25-mobile-student-home');
  const overflow = await M.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `горизонталь айналдыру бар: ${overflow}px`);
  for (const path of ['plan', 'tasks', 'tracker', 'reading', 'qa', 'results']) {
    await M.p.goto(`${BASE}/student/${path}`);
    await M.p.waitForTimeout(700);
    const o = await M.p.evaluate(() => {
      const w = window.innerWidth;
      const bad = [...document.querySelectorAll('main *')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || getComputedStyle(el).position === 'fixed') return false;
        let p = el.parentElement; // горизонталь айналатын контейнер ішіндегілерді есептемейміз
        while (p) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return false; p = p.parentElement; }
        return r.right > w + 1;
      });
      return Math.max(document.documentElement.scrollWidth - w, bad.length);
    });
    assert.ok(o <= 0, `/student/${path}: горизонталь айналдыру ${o}px`);
    await shot(M.p, `26-mobile-${path}`);
  }
  await M.p.getByRole('button', { name: 'Мәзір' }).click();
  await M.p.waitForTimeout(400);
  await shot(M.p, '27-mobile-menu');
});

await step('Бетті жаңартқанда деректер сақталады', async () => {
  await S.p.goto(`${BASE}/student/tracker`);
  await S.p.reload();
  await S.p.getByText('Прогресс — 75%').waitFor();
});

console.log(errors.length ? `\nКонсоль қателері (${errors.length}):\n` + [...new Set(errors)].slice(0, 15).join('\n') : '\nКонсоль қателері жоқ');
await browser.close();
