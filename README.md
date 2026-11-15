# KÓMEKSHI

Оқу нәтижесі төмен оқушылармен жеке жұмыс жүргізуге арналған білім беру платформасы.
Үш кабинет: **Оқушы**, **Куратор**, **Организатор**.

**Стек:** Next.js 15 (App Router, TypeScript, Tailwind CSS 4) · Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) · Vercel.

## Мүмкіндіктер

| Кабинет | Бөлімдер |
|---|---|
| Оқушы | Басты бет, Менің жоспарым (ай күнтізбесі), Тапсырмалар, Апталық трекер, Кітап оқу есебі, Сұрақ-жауап (видео плеер), Нәтижелерім, Хабарламалар, Профиль |
| Куратор | Басты бет, Менің оқушыларым (+ жеке профиль), Жоспарлар, Тапсырмалар (бірнеше оқушыға), Апталық трекер (құрастыру, тағайындау, тікелей бақылау), Кітап оқу есептері, Сұрақ-жауап видеолары, Тіркелу өтініштері, Статистика |
| Организатор | Басты бет, Оқушылар (ауыстыру, бұғаттау, өшіру), Кураторлар, Тіркелу өтініштері, Жалпы статистика, Платформа баптаулары |

Тіркелу өтініш арқылы жүреді: оқушы → таңдаған куратор мақұлдайды; куратор → организатор мақұлдайды.
Мақұлданғанша аккаунт жеке кабинетке кіре алмайды (тексеру middleware, сервер layout және RLS деңгейінде).

## Қауіпсіздік

- Барлық кестеде **Row Level Security** қосулы. Оқушы тек өз деректерін, куратор тек өз тобын, организатор бәрін көреді.
- Рөл мен статусты клиент өзгерте алмайды: қорғаныс триггерлері + `security definer` функциялары (`decide_student_request`, `set_account_status`, т.б.).
- Организатор қарапайым тіркелу арқылы жасалмайды — тек `app_metadata` (қызметтік кілт) арқылы.
- Құпиясөздерді Supabase Auth bcrypt хэшімен сақтайды.
- Видеолар жабық `qa-videos` бакетінде; оқушы тек өзіне тағайындалған видеоны қысқа мерзімді сілтеме арқылы ашады. Көлем (≤500 МБ) және формат (MP4, WebM, MOV, M4V, OGG) шектелген.

## Іске қосу (production)

### 1. Supabase жобасы
1. [supabase.com](https://supabase.com) → **New project**.
2. **SQL Editor** → `supabase/setup.sql` файлының мазмұнын қойып, **Run** басыңыз
   (немесе Supabase CLI арқылы: `npx supabase link --project-ref <ref>` және `npx supabase db push`).
3. **Authentication → URL Configuration**: *Site URL* = сайтыңыздың мекенжайы (мысалы `https://komekshi.vercel.app`),
   *Redirect URLs* тізіміне `https://komekshi.vercel.app/auth/callback` қосыңыз.
4. **Authentication → Sign In / Providers → Email**: поштаны растауды қалдыруға немесе өшіруге болады.
   Қосулы болса, тіркелген адам алдымен поштасын растайды, содан кейін өтініш күйін көреді.
5. **Storage → Settings**: жобаның жалпы файл шегі кемінде 500 МБ екенін тексеріңіз (тегін тарифте 50 МБ — онда платформа баптауларында видео шегін 50 МБ етіп қойыңыз).

### 2. Алғашқы организатор
**А нұсқасы (скрипт):**
```bash
cp .env.example .env.local   # URL, anon және service_role кілттерін енгізіңіз
npm install
npm run create-organizer -- --email admin@mail.kz --name "Аты Жөні"
```
**Ә нұсқасы (тек Supabase Dashboard):** *Authentication → Users → Add user* арқылы пайдаланушы жасаңыз
(Auto confirm қосулы), содан кейін SQL Editor-де:
```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"organizer"}'::jsonb
where email = 'admin@mail.kz';
```

### 3. Vercel
1. GitHub репозиторийін Vercel-ге импорттаңыз.
2. **Environment Variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   (`SUPABASE_SERVICE_ROLE_KEY` Vercel-ге **қажет емес** — тек организатор скрипті үшін.)
3. **Deploy**.

## Жергілікті әзірлеу

```bash
npm install
npx supabase start          # Docker қажет; миграциялар автоматты қолданылады
npx supabase status         # кілттерді .env.local-ға көшіріңіз
npm run create-organizer -- --email admin@komekshi.kz --name "Организатор" --password "..."
npm run dev                 # http://localhost:3000
```

## Тесттер

```bash
# Деректер базасы, бизнес-логика және RLS (жергілікті Supabase-ке қарсы)
SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:db

# Браузердегі толық сценарий (Playwright): тіркелу → мақұлдау → барлық бөлімдер → мобильді
npm run build && npm start &
BASE_URL=http://localhost:3000 node tests/e2e-flow.mjs
```

## Құрылым

```
supabase/migrations/   кестелер, RLS, триггерлер, RPC, Storage, Realtime
src/middleware.ts      сессия және рөлдік бағыттау
src/app/               беттер (student/, curator/, organizer/, login, register, pending)
src/components/ui/     дизайн жүйесі (батырма, карточка, модаль, форма, toast)
src/components/shell/  навигация (сол панель, оң панель, мобильді мәзір), хабарламалар
src/components/features/ жоспар күнтізбесі, тапсырмалар, трекер, есептер, видео, статистика
scripts/               организаторды жасау
tests/                 RLS тесттері және e2e сценарийі
```
