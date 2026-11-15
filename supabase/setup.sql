-- KÓMEKSHI: барлық миграциялар бір файлда (Supabase SQL Editor-ге қою үшін).
-- Бұл файл supabase/migrations/ ішіндегі файлдардан жасалған.

-- =====================================================================
-- KÓMEKSHI — деректер базасының құрылымы
-- Кестелер, типтер, индекстер
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Типтер ----------
create type public.user_role         as enum ('student', 'curator', 'organizer');
create type public.account_status    as enum ('pending', 'active', 'rejected', 'blocked');
create type public.request_status    as enum ('pending', 'approved', 'rejected');
create type public.priority_level    as enum ('low', 'medium', 'high');
create type public.plan_status       as enum ('todo', 'in_progress', 'done');
create type public.submission_status as enum ('new', 'in_progress', 'pending_review', 'accepted', 'needs_revision');
create type public.tracker_category  as enum ('topic', 'task', 'lesson');
create type public.tracker_task_type as enum ('test', 'review', 'written', 'extra');
create type public.attendance_status as enum ('pending', 'attended', 'missed');
create type public.report_status     as enum ('submitted', 'accepted', 'needs_revision');

-- Қазақстан уақыты бойынша бүгінгі күн
create or replace function public.kz_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Almaty')::date $$;

-- Аптаның дүйсенбісі
create or replace function public.week_monday(d date) returns date
language sql immutable as $$ select (d - ((extract(isodow from d)::int) - 1))::date $$;

-- ---------- Платформа баптаулары ----------
create table public.platform_settings (
  id int primary key default 1 check (id = 1),
  platform_name text not null default 'KÓMEKSHI',
  student_registration_open boolean not null default true,
  curator_registration_open boolean not null default true,
  max_video_mb int not null default 500 check (max_video_mb between 10 and 500),
  welcome_message text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.platform_settings (id) values (1);

-- ---------- Профильдер ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text not null,
  role public.user_role not null,
  status public.account_status not null default 'pending',
  contact_info text check (contact_info is null or char_length(contact_info) <= 300),
  bio text check (bio is null or char_length(bio) <= 1000),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  last_active_at timestamptz
);
create index profiles_role_status_idx on public.profiles (role, status);

create table public.curators (
  id uuid primary key references public.profiles (id) on delete cascade,
  accepting_students boolean not null default true,
  activated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key references public.profiles (id) on delete cascade,
  curator_id uuid references public.curators (id) on delete set null,
  joined_at timestamptz
);
create index students_curator_idx on public.students (curator_id);

-- ---------- Өтініштер ----------
create table public.student_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  curator_id uuid references public.profiles (id) on delete set null,
  status public.request_status not null default 'pending',
  message text check (message is null or char_length(message) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null
);
create index student_requests_curator_idx on public.student_requests (curator_id, status);
create index student_requests_student_idx on public.student_requests (student_id, created_at desc);
create unique index student_requests_one_pending on public.student_requests (student_id) where status = 'pending';

create table public.curator_requests (
  id uuid primary key default gen_random_uuid(),
  curator_id uuid not null references public.profiles (id) on delete cascade,
  contact_info text,
  message text check (message is null or char_length(message) <= 1000),
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null
);
create index curator_requests_status_idx on public.curator_requests (status, created_at desc);
create unique index curator_requests_one_pending on public.curator_requests (curator_id) where status = 'pending';

-- ---------- Жоспарлар ----------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  creator_role public.user_role not null check (creator_role in ('student', 'curator')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  plan_date date not null,
  start_time time,
  end_time time,
  priority public.priority_level not null default 'medium',
  status public.plan_status not null default 'todo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time is null or end_time is null or end_time > start_time)
);
create index plans_student_date_idx on public.plans (student_id, plan_date);

-- ---------- Тапсырмалар ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  curator_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 8000),
  instructions text check (instructions is null or char_length(instructions) <= 8000),
  start_date date not null default public.kz_today(),
  due_date date not null,
  priority public.priority_level not null default 'medium',
  created_at timestamptz not null default now(),
  check (due_date >= start_date)
);
create index tasks_curator_idx on public.tasks (curator_id, created_at desc);

create table public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status public.submission_status not null default 'new',
  student_comment text check (student_comment is null or char_length(student_comment) <= 4000),
  curator_comment text check (curator_comment is null or char_length(curator_comment) <= 4000),
  assigned_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (task_id, student_id)
);
create index task_submissions_student_idx on public.task_submissions (student_id, status);

-- ---------- Апталық трекер ----------
create table public.weekly_trackers (
  id uuid primary key default gen_random_uuid(),
  curator_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  week_start date not null,
  week_end date generated always as (week_start + 6) stored,
  created_at timestamptz not null default now()
);
create index weekly_trackers_curator_idx on public.weekly_trackers (curator_id, week_start desc);

create table public.weekly_tracker_items (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.weekly_trackers (id) on delete cascade,
  category public.tracker_category not null,
  task_type public.tracker_task_type,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  lesson_date date,
  lesson_time time,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (category = 'task' or task_type is null)
);
create index weekly_tracker_items_tracker_idx on public.weekly_tracker_items (tracker_id, sort_order);

create table public.tracker_assignments (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.weekly_trackers (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (tracker_id, student_id)
);
create index tracker_assignments_student_idx on public.tracker_assignments (student_id);

create table public.tracker_progress (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.weekly_tracker_items (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  done boolean not null default false,
  attendance public.attendance_status not null default 'pending',
  updated_at timestamptz not null default now(),
  unique (item_id, student_id)
);
create index tracker_progress_student_idx on public.tracker_progress (student_id);

-- ---------- Кітап оқу есебі ----------
create table public.book_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  curator_id uuid references public.profiles (id) on delete set null,
  book_title text not null check (char_length(btrim(book_title)) between 1 and 300),
  publisher text check (publisher is null or char_length(publisher) <= 200),
  pages_read int not null check (pages_read between 1 and 5000),
  minutes_spent int not null check (minutes_spent between 1 and 1440),
  section text check (section is null or char_length(section) <= 300),
  summary text not null check (char_length(btrim(summary)) between 1 and 8000),
  reflection text check (reflection is null or char_length(reflection) <= 8000),
  read_date date not null default public.kz_today(),
  status public.report_status not null default 'submitted',
  curator_comment text check (curator_comment is null or char_length(curator_comment) <= 4000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index book_reports_student_idx on public.book_reports (student_id, created_at desc);
create index book_reports_curator_idx on public.book_reports (curator_id, status);

-- ---------- Сұрақ-жауап видеолары ----------
create table public.qa_videos (
  id uuid primary key default gen_random_uuid(),
  curator_id uuid references public.profiles (id) on delete set null,
  week_label text not null check (char_length(btrim(week_label)) between 1 and 120),
  week_start date not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now()
);
create index qa_videos_curator_idx on public.qa_videos (curator_id, week_start desc);

create table public.qa_video_assignments (
  video_id uuid not null references public.qa_videos (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (video_id, student_id)
);
create index qa_video_assignments_student_idx on public.qa_video_assignments (student_id);

create table public.qa_participation (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.qa_videos (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  watched_seconds int not null default 0 check (watched_seconds >= 0),
  last_position int not null default 0 check (last_position >= 0),
  updated_at timestamptz not null default now(),
  unique (video_id, student_id)
);

-- ---------- Хабарламалар ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  ref_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------- Әрекеттер журналы ----------
create table public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_actor_idx on public.activity_log (actor_id, created_at desc);
create index activity_log_created_idx on public.activity_log (created_at desc);
-- =====================================================================
-- KÓMEKSHI — рөлдік көмекші функциялар, бизнес-логика триггерлері,
-- Row Level Security саясаттары
-- =====================================================================

-- ---------- Рөлдік көмекші функциялар ----------
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_organizer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'organizer', false)
$$;

create or replace function public.is_curator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'curator', false)
$$;

create or replace function public.is_student() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'student', false)
$$;

-- Шақырушы белсенді куратор және бұл оқушы оның тобында ма?
create or replace function public.is_my_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    join public.profiles me on me.id = auth.uid()
    where s.id = sid and s.curator_id = auth.uid()
      and me.role = 'curator' and me.status = 'active'
  )
$$;

-- Шақырушы — осы белсенді оқушының өзі ме?
create or replace function public.is_self_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select sid = auth.uid() and public.is_student()
$$;

create or replace function public.can_view_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_self_student(sid) or public.is_my_student(sid) or public.is_organizer()
$$;

-- Сұраныс клиенттен тікелей келді ме (security definer функциясы емес)?
create or replace function public.is_client() returns boolean
language sql stable as $$
  select current_user in ('authenticated', 'anon')
$$;

-- ---------- Ішкі қызметтік функциялар (клиентке жабық) ----------
create or replace function public.notify(
  p_user uuid, p_type text, p_title text, p_body text, p_link text, p_ref uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, type, title, body, link, ref_id)
  values (p_user, p_type, p_title, p_body, p_link, p_ref);
end $$;

create or replace function public.log_activity(
  p_action text, p_entity text default null, p_entity_id uuid default null, p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
end $$;

revoke execute on function public.notify(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.log_activity(text, text, uuid, jsonb) from public, anon, authenticated;

-- =====================================================================
-- Тіркелу: auth.users-ке жаңа жазба түскенде профиль мен өтініш жасау
-- =====================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', '');
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  v_contact text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'contact_info', '')), '');
  v_message text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'message', '')), '');
  v_curator uuid;
  v_settings public.platform_settings;
  r record;
begin
  select * into v_settings from public.platform_settings where id = 1;

  -- Организатор тек қызметтік кілт арқылы (app_metadata) жасалады
  if coalesce(new.raw_app_meta_data ->> 'role', '') = 'organizer' then
    insert into public.profiles (id, full_name, email, role, status, approved_at)
    values (new.id, coalesce(nullif(v_name, ''), 'Организатор'), new.email, 'organizer', 'active', now());
    return new;
  end if;

  -- Рөлсіз жасалған пайдаланушы (мысалы, организаторды бастапқы баптау кезінде
  -- қызметтік кілтпен жасалады) — профиль кейін app_metadata арқылы беріледі
  if v_role = '' then
    return new;
  end if;

  if char_length(v_name) < 2 then
    raise exception 'KOM_INVALID_NAME';
  end if;

  if v_role = 'student' then
    if not v_settings.student_registration_open then
      raise exception 'KOM_REGISTRATION_CLOSED';
    end if;
    begin
      v_curator := nullif(new.raw_user_meta_data ->> 'curator_id', '')::uuid;
    exception when others then
      raise exception 'KOM_INVALID_CURATOR';
    end;
    if v_curator is null or not exists (
      select 1 from public.profiles p join public.curators c on c.id = p.id
      where p.id = v_curator and p.role = 'curator' and p.status = 'active' and c.accepting_students
    ) then
      raise exception 'KOM_INVALID_CURATOR';
    end if;

    insert into public.profiles (id, full_name, email, role, status)
    values (new.id, v_name, new.email, 'student', 'pending');
    insert into public.students (id) values (new.id);
    insert into public.student_requests (student_id, curator_id, message)
    values (new.id, v_curator, v_message);

    perform public.notify(v_curator, 'student_request', 'Жаңа оқушы өтініші',
      v_name || ' сіздің тобыңызға тіркелуге өтініш жіберді.', '/curator/requests', new.id);

  elsif v_role = 'curator' then
    if not v_settings.curator_registration_open then
      raise exception 'KOM_REGISTRATION_CLOSED';
    end if;
    if v_contact is null then
      raise exception 'KOM_CONTACT_REQUIRED';
    end if;

    insert into public.profiles (id, full_name, email, role, status, contact_info)
    values (new.id, v_name, new.email, 'curator', 'pending', v_contact);
    insert into public.curator_requests (curator_id, contact_info, message)
    values (new.id, v_contact, v_message);

    for r in select id from public.profiles where role = 'organizer' and status = 'active' loop
      perform public.notify(r.id, 'curator_request', 'Жаңа куратор өтініші',
        v_name || ' куратор ретінде тіркелуге өтініш жіберді.', '/organizer/requests', new.id);
    end loop;
  else
    raise exception 'KOM_INVALID_ROLE';
  end if;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Организаторды бастапқы баптау: app_metadata.role = 'organizer' тек қызметтік
-- (service_role) кілт арқылы орнатылады, пайдаланушы оны өзі өзгерте алмайды.
create or replace function public.handle_app_metadata_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'role', '') = 'organizer'
     and coalesce(old.raw_app_meta_data ->> 'role', '') <> 'organizer' then
    insert into public.profiles (id, full_name, email, role, status, approved_at)
    values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Организатор'),
            new.email, 'organizer', 'active', now())
    on conflict (id) do update set role = 'organizer', status = 'active',
      approved_at = coalesce(public.profiles.approved_at, now());
  end if;
  return new;
end $$;

create trigger on_auth_user_app_metadata
  after update of raw_app_meta_data on auth.users
  for each row execute function public.handle_app_metadata_change();

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- =====================================================================
-- Қорғаныс триггерлері (клиенттен тікелей өзгертуге шектеу)
-- =====================================================================

-- Профиль: рөл, статус, пошта тек сервер функциялары арқылы өзгереді
create or replace function public.guard_profiles() returns trigger
language plpgsql as $$
begin
  if public.is_client() then
    if new.id <> old.id or new.role <> old.role or new.status <> old.status
       or new.email <> old.email or new.created_at <> old.created_at
       or new.approved_at is distinct from old.approved_at then
      raise exception 'KOM_FORBIDDEN';
    end if;
  end if;
  return new;
end $$;
create trigger guard_profiles before update on public.profiles
  for each row execute function public.guard_profiles();

-- Жоспарлар
create or replace function public.guard_plans() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client() then
      new.created_by := auth.uid();
      new.creator_role := case when new.student_id = auth.uid() then 'student'::public.user_role
                               else 'curator'::public.user_role end;
      new.created_at := now();
    end if;
    new.updated_at := now();
    return new;
  end if;

  if public.is_client() then
    if new.student_id <> old.student_id or new.created_by is distinct from old.created_by
       or new.creator_role <> old.creator_role or new.created_at <> old.created_at then
      raise exception 'KOM_FORBIDDEN';
    end if;
    -- Куратор жасаған жоспарда оқушы тек статусты өзгерте алады
    if auth.uid() = old.student_id and old.creator_role = 'curator' then
      if new.title <> old.title or new.description is distinct from old.description
         or new.plan_date <> old.plan_date or new.start_time is distinct from old.start_time
         or new.end_time is distinct from old.end_time or new.priority <> old.priority then
        raise exception 'KOM_CURATOR_PLAN_LOCKED';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger guard_plans before insert or update on public.plans
  for each row execute function public.guard_plans();

-- Тапсырма тапсыру
create or replace function public.guard_task_submissions() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client() then
      new.status := 'new';
      new.student_comment := null;
      new.curator_comment := null;
      new.submitted_at := null;
      new.reviewed_at := null;
      new.assigned_at := now();
    end if;
    new.updated_at := now();
    return new;
  end if;

  if public.is_client() then
    if new.task_id <> old.task_id or new.student_id <> old.student_id or new.assigned_at <> old.assigned_at then
      raise exception 'KOM_FORBIDDEN';
    end if;

    if auth.uid() = old.student_id then
      -- Оқушы
      if new.curator_comment is distinct from old.curator_comment
         or new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'KOM_FORBIDDEN';
      end if;
      if new.status <> old.status then
        if old.status = 'accepted' then
          raise exception 'KOM_TASK_ALREADY_ACCEPTED';
        end if;
        if new.status not in ('in_progress', 'pending_review') then
          raise exception 'KOM_FORBIDDEN';
        end if;
        if new.status = 'pending_review' then
          new.submitted_at := now();
        end if;
      end if;
    else
      -- Куратор
      if new.student_comment is distinct from old.student_comment
         or new.submitted_at is distinct from old.submitted_at then
        raise exception 'KOM_FORBIDDEN';
      end if;
      if new.status <> old.status then
        if new.status not in ('accepted', 'needs_revision') then
          raise exception 'KOM_FORBIDDEN';
        end if;
        new.reviewed_at := now();
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger guard_task_submissions before insert or update on public.task_submissions
  for each row execute function public.guard_task_submissions();

-- Кітап оқу есебі
create or replace function public.guard_book_reports() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client() then
      new.curator_id := (select curator_id from public.students where id = new.student_id);
      new.status := 'submitted';
      new.curator_comment := null;
      new.reviewed_at := null;
      new.created_at := now();
    end if;
    return new;
  end if;

  if public.is_client() then
    if new.student_id <> old.student_id or new.created_at <> old.created_at
       or new.curator_id is distinct from old.curator_id then
      raise exception 'KOM_FORBIDDEN';
    end if;
    if auth.uid() = old.student_id then
      -- Оқушы тек «қайта өңдеу» күйіндегі есепті түзетіп, қайта жібере алады
      if old.status <> 'needs_revision' then
        raise exception 'KOM_REPORT_LOCKED';
      end if;
      if new.curator_comment is distinct from old.curator_comment then
        raise exception 'KOM_FORBIDDEN';
      end if;
      new.status := 'submitted';
      new.reviewed_at := null;
    else
      -- Куратор тек статус пен пікірді өзгертеді
      if new.book_title <> old.book_title or new.publisher is distinct from old.publisher
         or new.pages_read <> old.pages_read or new.minutes_spent <> old.minutes_spent
         or new.section is distinct from old.section or new.summary <> old.summary
         or new.reflection is distinct from old.reflection or new.read_date <> old.read_date then
        raise exception 'KOM_FORBIDDEN';
      end if;
      if new.status <> old.status then
        if new.status not in ('accepted', 'needs_revision') then
          raise exception 'KOM_FORBIDDEN';
        end if;
        new.reviewed_at := now();
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger guard_book_reports before insert or update on public.book_reports
  for each row execute function public.guard_book_reports();

-- Трекер прогресі
create or replace function public.guard_tracker_progress() returns trigger
language plpgsql as $$
declare
  v_cat public.tracker_category;
begin
  if tg_op = 'UPDATE' and (new.item_id <> old.item_id or new.student_id <> old.student_id) then
    raise exception 'KOM_FORBIDDEN';
  end if;
  select category into v_cat from public.weekly_tracker_items where id = new.item_id;
  if v_cat = 'lesson' then
    new.done := (new.attendance = 'attended');
  else
    new.attendance := 'pending';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger guard_tracker_progress before insert or update on public.tracker_progress
  for each row execute function public.guard_tracker_progress();

-- Сұрақ-жауапқа қатысу
create or replace function public.guard_qa_participation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client() then
      new.started_at := now();
      new.completed_at := null;
      new.watched_seconds := 0;
    end if;
    new.updated_at := now();
    return new;
  end if;
  if new.video_id <> old.video_id or new.student_id <> old.student_id then
    raise exception 'KOM_FORBIDDEN';
  end if;
  new.started_at := old.started_at;
  new.watched_seconds := greatest(new.watched_seconds, old.watched_seconds);
  if old.completed_at is not null then
    new.completed_at := old.completed_at;
  elsif new.completed_at is not null then
    new.completed_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger guard_qa_participation before insert or update on public.qa_participation
  for each row execute function public.guard_qa_participation();

-- qa_videos: жолды өзгертуге болмайды
create or replace function public.guard_qa_videos() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client() then
      new.curator_id := auth.uid();
      new.created_at := now();
    end if;
    return new;
  end if;
  if public.is_client() and (new.storage_path <> old.storage_path or new.curator_id is distinct from old.curator_id
     or new.size_bytes <> old.size_bytes or new.mime_type <> old.mime_type) then
    raise exception 'KOM_FORBIDDEN';
  end if;
  return new;
end $$;
create trigger guard_qa_videos before insert or update on public.qa_videos
  for each row execute function public.guard_qa_videos();

-- tasks / trackers: авторды бекіту
create or replace function public.guard_owned_by_curator() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client() then
      new.curator_id := auth.uid();
    end if;
    return new;
  end if;
  if public.is_client() and new.curator_id is distinct from old.curator_id then
    raise exception 'KOM_FORBIDDEN';
  end if;
  return new;
end $$;
create trigger guard_tasks before insert or update on public.tasks
  for each row execute function public.guard_owned_by_curator();
create trigger guard_weekly_trackers before insert or update on public.weekly_trackers
  for each row execute function public.guard_owned_by_curator();

-- =====================================================================
-- Хабарлама және журнал триггерлері
-- =====================================================================
create or replace function public.on_plan_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.creator_role = 'curator' then
    perform public.notify(new.student_id, 'plan_added', 'Жаңа жоспар қосылды',
      'Куратор ' || to_char(new.plan_date, 'DD.MM.YYYY') || ' күніне жоспар қосты: ' || new.title,
      '/student/plan?date=' || new.plan_date::text, new.id);
  end if;
  perform public.log_activity('plan_created', 'plan', new.id,
    jsonb_build_object('student_id', new.student_id, 'by', new.creator_role));
  return new;
end $$;
create trigger on_plan_created after insert on public.plans
  for each row execute function public.on_plan_created();

create or replace function public.on_plan_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> old.status and new.status = 'done' then
    perform public.log_activity('plan_done', 'plan', new.id, jsonb_build_object('student_id', new.student_id));
  end if;
  return new;
end $$;
create trigger on_plan_status after update of status on public.plans
  for each row execute function public.on_plan_status();

create or replace function public.on_submission_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  select title into v_title from public.tasks where id = new.task_id;
  perform public.notify(new.student_id, 'task_assigned', 'Жаңа тапсырма берілді', v_title,
    '/student/tasks?id=' || new.id, new.id);
  return new;
end $$;
create trigger on_submission_created after insert on public.task_submissions
  for each row execute function public.on_submission_created();

create or replace function public.on_submission_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_title text; v_curator uuid; v_student text;
begin
  if new.status = old.status then return new; end if;
  select t.title, coalesce(s.curator_id, t.curator_id) into v_title, v_curator
    from public.tasks t, public.students s where t.id = new.task_id and s.id = new.student_id;
  select full_name into v_student from public.profiles where id = new.student_id;

  if new.status = 'pending_review' then
    perform public.notify(v_curator, 'task_submitted', 'Оқушы тапсырманы орындады',
      v_student || ': «' || v_title || '»', '/curator/tasks?review=' || new.id, new.id);
    perform public.log_activity('task_submitted', 'task_submission', new.id, jsonb_build_object('student_id', new.student_id));
  elsif new.status = 'accepted' then
    perform public.notify(new.student_id, 'task_accepted', 'Тапсырма қабылданды', '«' || v_title || '»',
      '/student/tasks?id=' || new.id, new.id);
    perform public.log_activity('task_accepted', 'task_submission', new.id, jsonb_build_object('student_id', new.student_id));
  elsif new.status = 'needs_revision' then
    perform public.notify(new.student_id, 'task_revision', 'Тапсырманы қайта орындау қажет', '«' || v_title || '»',
      '/student/tasks?id=' || new.id, new.id);
    perform public.log_activity('task_revision', 'task_submission', new.id, jsonb_build_object('student_id', new.student_id));
  elsif new.status = 'in_progress' then
    perform public.log_activity('task_started', 'task_submission', new.id, jsonb_build_object('student_id', new.student_id));
  end if;
  return new;
end $$;
create trigger on_submission_status after update of status on public.task_submissions
  for each row execute function public.on_submission_status();

create or replace function public.on_tracker_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_week date;
begin
  select title, week_start into v_title, v_week from public.weekly_trackers where id = new.tracker_id;
  perform public.notify(new.student_id, 'tracker_published', 'Апталық трекер жарияланды',
    v_title || ' (' || to_char(v_week, 'DD.MM') || ' – ' || to_char(v_week + 6, 'DD.MM') || ')',
    '/student/tracker?id=' || new.tracker_id, new.tracker_id);
  return new;
end $$;
create trigger on_tracker_assigned after insert on public.tracker_assignments
  for each row execute function public.on_tracker_assigned();

create or replace function public.on_tracker_progress() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_curator uuid; v_student text; v_tracker uuid;
begin
  select curator_id into v_curator from public.students where id = new.student_id;
  select tracker_id into v_tracker from public.weekly_tracker_items where id = new.item_id;
  perform public.log_activity('tracker_update', 'tracker', v_tracker,
    jsonb_build_object('student_id', new.student_id, 'done', new.done));
  -- Куратордың хабарламаларын толтырып жібермеу үшін: бір оқушыдан 30 минутта бір рет
  if v_curator is not null and not exists (
    select 1 from public.notifications
    where user_id = v_curator and type = 'tracker_updated' and ref_id = new.student_id
      and created_at > now() - interval '30 minutes'
  ) then
    select full_name into v_student from public.profiles where id = new.student_id;
    perform public.notify(v_curator, 'tracker_updated', 'Оқушы апталық трекерді жаңартты', v_student,
      '/curator/tracker?id=' || v_tracker, new.student_id);
  end if;
  return new;
end $$;
create trigger on_tracker_progress after insert or update on public.tracker_progress
  for each row execute function public.on_tracker_progress();

create or replace function public.on_report_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_student text;
begin
  select full_name into v_student from public.profiles where id = new.student_id;
  perform public.notify(new.curator_id, 'report_submitted', 'Жаңа кітап оқу есебі',
    v_student || ': «' || new.book_title || '», ' || new.pages_read || ' бет', '/curator/reports?id=' || new.id, new.id);
  perform public.log_activity('report_submitted', 'book_report', new.id,
    jsonb_build_object('student_id', new.student_id, 'pages', new.pages_read));
  return new;
end $$;
create trigger on_report_created after insert on public.book_reports
  for each row execute function public.on_report_created();

create or replace function public.on_report_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_student text;
begin
  if new.status = old.status then return new; end if;
  if new.status = 'accepted' then
    perform public.notify(new.student_id, 'report_accepted', 'Куратор есепті қабылдады', '«' || new.book_title || '»',
      '/student/reading?id=' || new.id, new.id);
  elsif new.status = 'needs_revision' then
    perform public.notify(new.student_id, 'report_revision', 'Есепті толықтыру қажет', '«' || new.book_title || '»',
      '/student/reading?id=' || new.id, new.id);
  elsif new.status = 'submitted' then
    select full_name into v_student from public.profiles where id = new.student_id;
    perform public.notify(new.curator_id, 'report_submitted', 'Есеп қайта жіберілді',
      v_student || ': «' || new.book_title || '»', '/curator/reports?id=' || new.id, new.id);
  end if;
  perform public.log_activity('report_' || new.status::text, 'book_report', new.id, jsonb_build_object('student_id', new.student_id));
  return new;
end $$;
create trigger on_report_status after update of status on public.book_reports
  for each row execute function public.on_report_status();

create or replace function public.on_video_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select title, week_label into v from public.qa_videos where id = new.video_id;
  perform public.notify(new.student_id, 'qa_video', 'Жаңа сұрақ-жауап видеосы жүктелді',
    v.week_label || ': ' || v.title, '/student/qa?id=' || new.video_id, new.video_id);
  return new;
end $$;
create trigger on_video_assigned after insert on public.qa_video_assignments
  for each row execute function public.on_video_assigned();

create or replace function public.on_qa_participation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('qa_started', 'qa_video', new.video_id, jsonb_build_object('student_id', new.student_id));
  elsif old.completed_at is null and new.completed_at is not null then
    perform public.log_activity('qa_completed', 'qa_video', new.video_id, jsonb_build_object('student_id', new.student_id));
  end if;
  return new;
end $$;
create trigger on_qa_participation after insert or update on public.qa_participation
  for each row execute function public.on_qa_participation();

create or replace function public.on_content_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(tg_argv[0], tg_table_name, new.id, '{}'::jsonb);
  return new;
end $$;
create trigger log_task_created after insert on public.tasks
  for each row execute function public.on_content_created('task_created');
create trigger log_tracker_created after insert on public.weekly_trackers
  for each row execute function public.on_content_created('tracker_created');
create trigger log_video_created after insert on public.qa_videos
  for each row execute function public.on_content_created('video_uploaded');

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.platform_settings    enable row level security;
alter table public.profiles             enable row level security;
alter table public.curators             enable row level security;
alter table public.students             enable row level security;
alter table public.student_requests     enable row level security;
alter table public.curator_requests     enable row level security;
alter table public.plans                enable row level security;
alter table public.tasks                enable row level security;
alter table public.task_submissions     enable row level security;
alter table public.weekly_trackers      enable row level security;
alter table public.weekly_tracker_items enable row level security;
alter table public.tracker_assignments  enable row level security;
alter table public.tracker_progress     enable row level security;
alter table public.book_reports         enable row level security;
alter table public.qa_videos            enable row level security;
alter table public.qa_video_assignments enable row level security;
alter table public.qa_participation     enable row level security;
alter table public.notifications        enable row level security;
alter table public.activity_log         enable row level security;

-- Анонимдерге тек ашық баптаулар ғана
revoke all on all tables in schema public from anon;
grant select on public.platform_settings to anon;

-- platform_settings
create policy settings_read on public.platform_settings for select using (true);
create policy settings_update on public.platform_settings for update to authenticated
  using (public.is_organizer()) with check (public.is_organizer());
revoke update on public.platform_settings from authenticated;
grant update (platform_name, student_registration_open, curator_registration_open, max_video_mb, welcome_message, updated_at, updated_by)
  on public.platform_settings to authenticated;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or public.is_organizer()
  or public.is_my_student(id)
  -- куратор өзіне өтініш жіберген оқушыны көреді
  or (public.is_curator() and exists (
        select 1 from public.student_requests r where r.student_id = profiles.id and r.curator_id = (select auth.uid())))
  -- оқушы өз кураторын көреді
  or (public.is_student() and exists (
        select 1 from public.students s where s.id = (select auth.uid()) and s.curator_id = profiles.id))
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, delete on public.profiles from authenticated;

-- curators
create policy curators_select on public.curators for select to authenticated using (
  id = (select auth.uid()) or public.is_organizer()
  or exists (select 1 from public.students s where s.id = (select auth.uid()) and s.curator_id = curators.id)
);
create policy curators_update_self on public.curators for update to authenticated
  using (id = (select auth.uid()) and public.is_curator()) with check (id = (select auth.uid()));
revoke insert, delete on public.curators from authenticated;
revoke update on public.curators from authenticated;
grant update (accepting_students) on public.curators to authenticated;

-- students
create policy students_select on public.students for select to authenticated using (
  id = (select auth.uid()) or public.is_organizer() or public.is_my_student(id)
);
revoke insert, update, delete on public.students from authenticated;

-- requests
create policy student_requests_select on public.student_requests for select to authenticated using (
  student_id = (select auth.uid()) or public.is_organizer()
  or (curator_id = (select auth.uid()) and public.is_curator())
);
revoke insert, update, delete on public.student_requests from authenticated;

create policy curator_requests_select on public.curator_requests for select to authenticated using (
  curator_id = (select auth.uid()) or public.is_organizer()
);
revoke insert, update, delete on public.curator_requests from authenticated;

-- plans
create policy plans_select on public.plans for select to authenticated using (public.can_view_student(student_id));
create policy plans_insert on public.plans for insert to authenticated with check (
  public.is_self_student(student_id) or public.is_my_student(student_id)
);
create policy plans_update on public.plans for update to authenticated
  using (public.is_self_student(student_id) or public.is_my_student(student_id))
  with check (public.is_self_student(student_id) or public.is_my_student(student_id));
create policy plans_delete on public.plans for delete to authenticated using (
  (public.is_self_student(student_id) and creator_role = 'student') or public.is_my_student(student_id)
);

-- tasks
create policy tasks_select on public.tasks for select to authenticated using (
  (curator_id = (select auth.uid()) and public.is_curator())
  or public.is_organizer()
  or exists (select 1 from public.task_submissions ts where ts.task_id = tasks.id
             and (public.is_self_student(ts.student_id) or public.is_my_student(ts.student_id)))
);
create policy tasks_insert on public.tasks for insert to authenticated with check (
  public.is_curator() and curator_id = (select auth.uid())
);
create policy tasks_update on public.tasks for update to authenticated
  using (curator_id = (select auth.uid()) and public.is_curator())
  with check (curator_id = (select auth.uid()));
create policy tasks_delete on public.tasks for delete to authenticated using (
  curator_id = (select auth.uid()) and public.is_curator()
);

-- task_submissions
create policy submissions_select on public.task_submissions for select to authenticated using (public.can_view_student(student_id));
create policy submissions_insert on public.task_submissions for insert to authenticated with check (
  public.is_my_student(student_id)
  and exists (select 1 from public.tasks t where t.id = task_id and t.curator_id = (select auth.uid()))
);
create policy submissions_update on public.task_submissions for update to authenticated
  using (public.is_self_student(student_id) or public.is_my_student(student_id))
  with check (public.is_self_student(student_id) or public.is_my_student(student_id));
create policy submissions_delete on public.task_submissions for delete to authenticated using (public.is_my_student(student_id));

-- weekly_trackers
create policy trackers_select on public.weekly_trackers for select to authenticated using (
  (curator_id = (select auth.uid()) and public.is_curator())
  or public.is_organizer()
  or exists (select 1 from public.tracker_assignments a where a.tracker_id = weekly_trackers.id
             and (public.is_self_student(a.student_id) or public.is_my_student(a.student_id)))
);
create policy trackers_insert on public.weekly_trackers for insert to authenticated with check (
  public.is_curator() and curator_id = (select auth.uid())
);
create policy trackers_update on public.weekly_trackers for update to authenticated
  using (curator_id = (select auth.uid()) and public.is_curator())
  with check (curator_id = (select auth.uid()));
create policy trackers_delete on public.weekly_trackers for delete to authenticated using (
  curator_id = (select auth.uid()) and public.is_curator()
);

-- weekly_tracker_items
create or replace function public.can_view_tracker(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.weekly_trackers t where t.id = tid and
    ((t.curator_id = auth.uid() and public.is_curator()) or public.is_organizer()
     or exists (select 1 from public.tracker_assignments a where a.tracker_id = t.id
                and (public.is_self_student(a.student_id) or public.is_my_student(a.student_id)))))
$$;
create or replace function public.owns_tracker(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.weekly_trackers t where t.id = tid and t.curator_id = auth.uid())
    and public.is_curator()
$$;
create policy tracker_items_select on public.weekly_tracker_items for select to authenticated using (public.can_view_tracker(tracker_id));
create policy tracker_items_insert on public.weekly_tracker_items for insert to authenticated with check (public.owns_tracker(tracker_id));
create policy tracker_items_update on public.weekly_tracker_items for update to authenticated
  using (public.owns_tracker(tracker_id)) with check (public.owns_tracker(tracker_id));
create policy tracker_items_delete on public.weekly_tracker_items for delete to authenticated using (public.owns_tracker(tracker_id));

-- tracker_assignments
create policy tracker_assign_select on public.tracker_assignments for select to authenticated using (public.can_view_student(student_id));
create policy tracker_assign_insert on public.tracker_assignments for insert to authenticated with check (
  public.owns_tracker(tracker_id) and public.is_my_student(student_id)
);
create policy tracker_assign_delete on public.tracker_assignments for delete to authenticated using (
  public.owns_tracker(tracker_id)
);
revoke update on public.tracker_assignments from authenticated;

-- tracker_progress — оқушы ғана толтырады
create policy tracker_progress_select on public.tracker_progress for select to authenticated using (public.can_view_student(student_id));
create policy tracker_progress_insert on public.tracker_progress for insert to authenticated with check (
  public.is_self_student(student_id) and exists (
    select 1 from public.weekly_tracker_items i
    join public.tracker_assignments a on a.tracker_id = i.tracker_id
    where i.id = item_id and a.student_id = tracker_progress.student_id)
);
create policy tracker_progress_update on public.tracker_progress for update to authenticated
  using (public.is_self_student(student_id)) with check (public.is_self_student(student_id));
revoke delete on public.tracker_progress from authenticated;

-- book_reports
create policy reports_select on public.book_reports for select to authenticated using (public.can_view_student(student_id));
create policy reports_insert on public.book_reports for insert to authenticated with check (public.is_self_student(student_id));
create policy reports_update on public.book_reports for update to authenticated
  using (public.is_self_student(student_id) or public.is_my_student(student_id))
  with check (public.is_self_student(student_id) or public.is_my_student(student_id));
create policy reports_delete on public.book_reports for delete to authenticated using (
  public.is_self_student(student_id) and status <> 'accepted'
);

-- qa_videos
create policy videos_select on public.qa_videos for select to authenticated using (
  (curator_id = (select auth.uid()) and public.is_curator())
  or public.is_organizer()
  or exists (select 1 from public.qa_video_assignments a where a.video_id = qa_videos.id
             and (public.is_self_student(a.student_id) or public.is_my_student(a.student_id)))
);
create policy videos_insert on public.qa_videos for insert to authenticated with check (
  public.is_curator() and curator_id = (select auth.uid())
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
);
create policy videos_update on public.qa_videos for update to authenticated
  using (curator_id = (select auth.uid()) and public.is_curator()) with check (curator_id = (select auth.uid()));
create policy videos_delete on public.qa_videos for delete to authenticated using (
  curator_id = (select auth.uid()) and public.is_curator()
);

create or replace function public.owns_video(vid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.qa_videos v where v.id = vid and v.curator_id = auth.uid()) and public.is_curator()
$$;

create policy video_assign_select on public.qa_video_assignments for select to authenticated using (public.can_view_student(student_id));
create policy video_assign_insert on public.qa_video_assignments for insert to authenticated with check (
  public.owns_video(video_id) and public.is_my_student(student_id)
);
create policy video_assign_delete on public.qa_video_assignments for delete to authenticated using (public.owns_video(video_id));
revoke update on public.qa_video_assignments from authenticated;

-- qa_participation
create policy participation_select on public.qa_participation for select to authenticated using (public.can_view_student(student_id));
create policy participation_insert on public.qa_participation for insert to authenticated with check (
  public.is_self_student(student_id) and exists (
    select 1 from public.qa_video_assignments a where a.video_id = qa_participation.video_id and a.student_id = qa_participation.student_id)
);
create policy participation_update on public.qa_participation for update to authenticated
  using (public.is_self_student(student_id)) with check (public.is_self_student(student_id));
revoke delete on public.qa_participation from authenticated;

-- notifications — тек өзінікі; тек read_at өзгертіледі
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- activity_log — тек организатор және куратор өз оқушылары бойынша
create policy activity_select on public.activity_log for select to authenticated using (
  public.is_organizer()
  or actor_id = (select auth.uid())
  or public.is_my_student(actor_id)
);
revoke insert, update, delete on public.activity_log from authenticated;
-- =====================================================================
-- KÓMEKSHI — клиент шақыратын RPC функциялары, статистика, Storage
-- =====================================================================

-- ---------- Ашық: белсенді кураторлар тізімі (тіркелу беті үшін) ----------
create or replace function public.list_active_curators()
returns table (id uuid, full_name text, bio text, student_count int)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.bio,
         (select count(*)::int from public.students s join public.profiles sp on sp.id = s.id
           where s.curator_id = p.id and sp.status = 'active')
  from public.profiles p
  join public.curators c on c.id = p.id
  where p.role = 'curator' and p.status = 'active' and c.accepting_students
  order by p.full_name
$$;
grant execute on function public.list_active_curators() to anon, authenticated;

-- ---------- Ағымдағы аккаунт күйі ----------
create or replace function public.my_account()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  v_req jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then return null; end if;

  if p.role = 'student' then
    select jsonb_build_object('id', r.id, 'status', r.status, 'created_at', r.created_at, 'decided_at', r.decided_at,
                              'curator_id', r.curator_id, 'curator_name', cp.full_name)
      into v_req
      from public.student_requests r left join public.profiles cp on cp.id = r.curator_id
      where r.student_id = p.id order by r.created_at desc limit 1;
  elsif p.role = 'curator' then
    select jsonb_build_object('id', r.id, 'status', r.status, 'created_at', r.created_at, 'decided_at', r.decided_at)
      into v_req
      from public.curator_requests r where r.curator_id = p.id order by r.created_at desc limit 1;
  end if;

  return jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', p.role, 'status', p.status,
    'contact_info', p.contact_info, 'bio', p.bio, 'created_at', p.created_at,
    'curator', case when p.role = 'student' then (
        select jsonb_build_object('id', cp.id, 'full_name', cp.full_name, 'contact_info', cp.contact_info)
        from public.students s join public.profiles cp on cp.id = s.curator_id where s.id = p.id) end,
    'request', v_req
  );
end $$;
grant execute on function public.my_account() to authenticated;

-- ---------- Белсенділікті белгілеу ----------
create or replace function public.touch_activity() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_active_at = now()
  where id = auth.uid() and (last_active_at is null or last_active_at < now() - interval '2 minutes')
$$;
grant execute on function public.touch_activity() to authenticated;

-- ---------- Қабылданбаған өтінішті қайта жіберу ----------
create or replace function public.resubmit_student_request(p_curator uuid, p_message text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.role is distinct from 'student' or p.status <> 'rejected' then
    raise exception 'KOM_FORBIDDEN';
  end if;
  if not exists (select 1 from public.profiles cp join public.curators c on c.id = cp.id
                 where cp.id = p_curator and cp.status = 'active' and c.accepting_students) then
    raise exception 'KOM_INVALID_CURATOR';
  end if;
  update public.profiles set status = 'pending' where id = p.id;
  insert into public.student_requests (student_id, curator_id, message) values (p.id, p_curator, nullif(btrim(p_message), ''));
  perform public.notify(p_curator, 'student_request', 'Жаңа оқушы өтініші',
    p.full_name || ' сіздің тобыңызға тіркелуге өтініш жіберді.', '/curator/requests', p.id);
end $$;
grant execute on function public.resubmit_student_request(uuid, text) to authenticated;

create or replace function public.resubmit_curator_request(p_contact text, p_message text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles; r record;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.role is distinct from 'curator' or p.status <> 'rejected' then
    raise exception 'KOM_FORBIDDEN';
  end if;
  if nullif(btrim(p_contact), '') is null then raise exception 'KOM_CONTACT_REQUIRED'; end if;
  update public.profiles set status = 'pending', contact_info = btrim(p_contact) where id = p.id;
  insert into public.curator_requests (curator_id, contact_info, message) values (p.id, btrim(p_contact), nullif(btrim(p_message), ''));
  for r in select id from public.profiles where role = 'organizer' and status = 'active' loop
    perform public.notify(r.id, 'curator_request', 'Жаңа куратор өтініші',
      p.full_name || ' куратор ретінде қайта өтініш жіберді.', '/organizer/requests', p.id);
  end loop;
end $$;
grant execute on function public.resubmit_curator_request(text, text) to authenticated;

-- ---------- Оқушы өтінішін шешу (куратор немесе организатор) ----------
create or replace function public.decide_student_request(p_request uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.student_requests;
begin
  select * into r from public.student_requests where id = p_request for update;
  if not found then raise exception 'KOM_NOT_FOUND'; end if;
  if not (public.is_organizer() or (public.is_curator() and r.curator_id = auth.uid())) then
    raise exception 'KOM_FORBIDDEN';
  end if;
  if r.status <> 'pending' then raise exception 'KOM_ALREADY_DECIDED'; end if;

  if p_approve then
    if r.curator_id is null or not exists (select 1 from public.profiles where id = r.curator_id and status = 'active') then
      raise exception 'KOM_INVALID_CURATOR';
    end if;
    update public.student_requests set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = r.id;
    update public.profiles set status = 'active', approved_at = coalesce(approved_at, now()) where id = r.student_id;
    update public.students set curator_id = r.curator_id, joined_at = now() where id = r.student_id;
    perform public.notify(r.student_id, 'request_approved', 'Өтінішіңіз қабылданды',
      'Куратор сізді өз тобына қабылдады. Оқу кеңістігіңізге қош келдіңіз!', '/student', r.id);
    perform public.log_activity('student_approved', 'student', r.student_id, jsonb_build_object('curator_id', r.curator_id));
  else
    update public.student_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = r.id;
    update public.profiles set status = 'rejected' where id = r.student_id;
    perform public.log_activity('student_rejected', 'student', r.student_id, jsonb_build_object('curator_id', r.curator_id));
  end if;
end $$;
grant execute on function public.decide_student_request(uuid, boolean) to authenticated;

-- ---------- Куратор өтінішін шешу (организатор) ----------
create or replace function public.decide_curator_request(p_request uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.curator_requests;
begin
  if not public.is_organizer() then raise exception 'KOM_FORBIDDEN'; end if;
  select * into r from public.curator_requests where id = p_request for update;
  if not found then raise exception 'KOM_NOT_FOUND'; end if;
  if r.status <> 'pending' then raise exception 'KOM_ALREADY_DECIDED'; end if;

  if p_approve then
    update public.curator_requests set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = r.id;
    update public.profiles set status = 'active', approved_at = coalesce(approved_at, now()) where id = r.curator_id;
    insert into public.curators (id) values (r.curator_id) on conflict (id) do nothing;
    perform public.notify(r.curator_id, 'request_approved', 'Өтінішіңіз қабылданды',
      'Сіз енді белсенді кураторсыз. Оқушылар сізді тіркелу кезінде таңдай алады.', '/curator', r.id);
    perform public.log_activity('curator_approved', 'curator', r.curator_id, '{}'::jsonb);
  else
    update public.curator_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = r.id;
    update public.profiles set status = 'rejected' where id = r.curator_id;
    perform public.log_activity('curator_rejected', 'curator', r.curator_id, '{}'::jsonb);
  end if;
end $$;
grant execute on function public.decide_curator_request(uuid, boolean) to authenticated;

-- ---------- Организатор: бұғаттау / белсендіру ----------
create or replace function public.set_account_status(p_user uuid, p_status public.account_status)
returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if not public.is_organizer() then raise exception 'KOM_FORBIDDEN'; end if;
  if p_status not in ('active', 'blocked') then raise exception 'KOM_FORBIDDEN'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'KOM_NOT_FOUND'; end if;
  if p.role = 'organizer' then raise exception 'KOM_CANNOT_MANAGE_ORGANIZER'; end if;
  if p_status = 'active' and p.approved_at is null then raise exception 'KOM_NOT_APPROVED_YET'; end if;
  if p_status = 'active' and p.role = 'student'
     and not exists (select 1 from public.students s join public.profiles cp on cp.id = s.curator_id
                     where s.id = p.id and cp.status = 'active') then
    raise exception 'KOM_STUDENT_NEEDS_CURATOR';
  end if;

  update public.profiles set status = p_status where id = p_user;
  perform public.notify(p_user, 'account_status',
    case when p_status = 'blocked' then 'Аккаунтыңыз уақытша бұғатталды' else 'Аккаунтыңыз қайта белсендірілді' end,
    null, null, null);
  perform public.log_activity('account_' || p_status::text, 'profile', p_user, jsonb_build_object('role', p.role));
end $$;
grant execute on function public.set_account_status(uuid, public.account_status) to authenticated;

-- ---------- Организатор: аккаунтты өшіру ----------
create or replace function public.delete_account(p_user uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare p public.profiles;
begin
  if not public.is_organizer() then raise exception 'KOM_FORBIDDEN'; end if;
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'KOM_NOT_FOUND'; end if;
  if p.role = 'organizer' then raise exception 'KOM_CANNOT_MANAGE_ORGANIZER'; end if;
  perform public.log_activity('account_deleted', 'profile', p_user,
    jsonb_build_object('role', p.role, 'full_name', p.full_name, 'email', p.email));
  delete from auth.users where id = p_user;
end $$;
grant execute on function public.delete_account(uuid) to authenticated;

-- ---------- Организатор: оқушыны басқа кураторға ауыстыру ----------
create or replace function public.transfer_student(p_student uuid, p_curator uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_name text; v_cname text;
begin
  if not public.is_organizer() then raise exception 'KOM_FORBIDDEN'; end if;
  if not exists (select 1 from public.profiles where id = p_student and role = 'student') then
    raise exception 'KOM_NOT_FOUND';
  end if;
  if not exists (select 1 from public.profiles p join public.curators c on c.id = p.id
                 where p.id = p_curator and p.status = 'active') then
    raise exception 'KOM_INVALID_CURATOR';
  end if;
  select curator_id into v_old from public.students where id = p_student for update;
  if v_old = p_curator then return; end if;

  update public.students set curator_id = p_curator, joined_at = coalesce(joined_at, now()) where id = p_student;
  -- Күтудегі өтініш болса, жаңа кураторға бағыттаймыз
  update public.student_requests set curator_id = p_curator where student_id = p_student and status = 'pending';

  select full_name into v_name from public.profiles where id = p_student;
  select full_name into v_cname from public.profiles where id = p_curator;
  perform public.notify(p_curator, 'student_transferred', 'Тобыңызға жаңа оқушы ауыстырылды', v_name,
    '/curator/students/' || p_student, p_student);
  if v_old is not null then
    perform public.notify(v_old, 'student_transferred', 'Оқушы басқа кураторға ауыстырылды', v_name, '/curator/students', p_student);
  end if;
  perform public.notify(p_student, 'curator_changed', 'Куратор ауыстырылды', 'Жаңа кураторыңыз: ' || v_cname, '/student', p_curator);
  perform public.log_activity('student_transferred', 'student', p_student, jsonb_build_object('from', v_old, 'to', p_curator));
end $$;
grant execute on function public.transfer_student(uuid, uuid) to authenticated;

-- ---------- Хабарламалар ----------
create or replace function public.mark_all_notifications_read() returns void
language sql security invoker set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ---------- Куратор: тапсырманы бірнеше оқушыға бір мезетте беру ----------
-- security invoker: RLS толық сақталады, бәрі бір транзакцияда орындалады
create or replace function public.create_task(
  p_title text, p_description text, p_instructions text,
  p_start date, p_due date, p_priority public.priority_level, p_students uuid[]
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_sid uuid;
begin
  if p_students is null or cardinality(p_students) = 0 then raise exception 'KOM_NO_STUDENTS'; end if;
  insert into public.tasks (curator_id, title, description, instructions, start_date, due_date, priority)
  values (auth.uid(), btrim(p_title), nullif(btrim(p_description), ''), nullif(btrim(p_instructions), ''),
          coalesce(p_start, public.kz_today()), p_due, coalesce(p_priority, 'medium'))
  returning id into v_id;
  foreach v_sid in array p_students loop
    insert into public.task_submissions (task_id, student_id) values (v_id, v_sid);
  end loop;
  return v_id;
end $$;
grant execute on function public.create_task(text, text, text, date, date, public.priority_level, uuid[]) to authenticated;

-- ---------- Куратор: апталық трекер жасау ----------
-- p_items: [{category, task_type, title, description, lesson_date, lesson_time}]
create or replace function public.create_tracker(
  p_title text, p_description text, p_week_start date, p_items jsonb, p_students uuid[]
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_item jsonb; v_sid uuid; v_i int := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'KOM_TRACKER_EMPTY'; end if;
  insert into public.weekly_trackers (curator_id, title, description, week_start)
  values (auth.uid(), btrim(p_title), nullif(btrim(p_description), ''), p_week_start)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    insert into public.weekly_tracker_items (tracker_id, category, task_type, title, description, lesson_date, lesson_time, sort_order)
    values (v_id, (v_item ->> 'category')::public.tracker_category,
            nullif(v_item ->> 'task_type', '')::public.tracker_task_type,
            btrim(v_item ->> 'title'), nullif(btrim(coalesce(v_item ->> 'description', '')), ''),
            nullif(v_item ->> 'lesson_date', '')::date, nullif(v_item ->> 'lesson_time', '')::time, v_i);
  end loop;
  if p_students is not null then
    foreach v_sid in array p_students loop
      insert into public.tracker_assignments (tracker_id, student_id) values (v_id, v_sid);
    end loop;
  end if;
  return v_id;
end $$;
grant execute on function public.create_tracker(text, text, date, jsonb, uuid[]) to authenticated;

-- =====================================================================
-- Статистика (security invoker → RLS бойынша тек рұқсат етілген деректер)
-- =====================================================================

-- Оқушыға шолу (куратор тізімі, организатор тізімі, статистика)
create or replace view public.v_student_overview with (security_invoker = true) as
select
  s.id, p.full_name, p.email, p.status, p.created_at, p.last_active_at, s.joined_at, s.curator_id,
  cp.full_name as curator_name,
  coalesce(tr.total, 0)::int as week_total,
  coalesce(tr.done, 0)::int as week_done,
  case when coalesce(tr.total, 0) = 0 then null else round(100.0 * tr.done / tr.total)::int end as week_progress,
  coalesce(ts.total, 0)::int as tasks_total,
  coalesce(ts.open, 0)::int as tasks_open,
  coalesce(ts.review, 0)::int as tasks_review,
  coalesce(ts.accepted, 0)::int as tasks_accepted,
  coalesce(ts.overdue, 0)::int as tasks_overdue,
  coalesce(pl.total, 0)::int as plans_total,
  coalesce(pl.done, 0)::int as plans_done,
  coalesce(br.pages, 0)::int as pages_total,
  coalesce(br.minutes, 0)::int as minutes_total,
  coalesce(br.books, 0)::int as books_total,
  coalesce(br.week_pages, 0)::int as week_pages,
  coalesce(br.pending, 0)::int as reports_pending,
  coalesce(qa.assigned, 0)::int as qa_assigned,
  coalesce(qa.completed, 0)::int as qa_completed
from public.students s
join public.profiles p on p.id = s.id
left join public.profiles cp on cp.id = s.curator_id
left join lateral (
  select count(i.id) as total, count(i.id) filter (where pr.done) as done
  from public.tracker_assignments a
  join public.weekly_trackers t on t.id = a.tracker_id and public.kz_today() between t.week_start and t.week_end
  join public.weekly_tracker_items i on i.tracker_id = t.id
  left join public.tracker_progress pr on pr.item_id = i.id and pr.student_id = s.id
  where a.student_id = s.id
) tr on true
left join lateral (
  select count(*) as total,
         count(*) filter (where x.status in ('new', 'in_progress', 'needs_revision')) as open,
         count(*) filter (where x.status = 'pending_review') as review,
         count(*) filter (where x.status = 'accepted') as accepted,
         count(*) filter (where x.status in ('new', 'in_progress', 'needs_revision') and t.due_date < public.kz_today()) as overdue
  from public.task_submissions x join public.tasks t on t.id = x.task_id
  where x.student_id = s.id
) ts on true
left join lateral (
  select count(*) as total, count(*) filter (where status = 'done') as done
  from public.plans where student_id = s.id
) pl on true
left join lateral (
  select sum(pages_read) as pages, sum(minutes_spent) as minutes,
         count(distinct lower(btrim(book_title))) as books,
         sum(pages_read) filter (where read_date >= public.week_monday(public.kz_today())) as week_pages,
         count(*) filter (where status = 'submitted') as pending
  from public.book_reports where student_id = s.id
) br on true
left join lateral (
  select count(*) as assigned, count(q.completed_at) as completed
  from public.qa_video_assignments va
  left join public.qa_participation q on q.video_id = va.video_id and q.student_id = va.student_id
  where va.student_id = s.id
) qa on true;

grant select on public.v_student_overview to authenticated;

-- Апта бойынша тарих (соңғы N апта)
create or replace function public.student_weekly_history(p_student uuid, p_weeks int default 8)
returns table (
  week_start date, tracker_total int, tracker_done int, progress int,
  pages int, minutes int, plans_total int, plans_done int, tasks_done int, qa_completed int, actions int
)
language sql stable security invoker set search_path = public as $$
  with weeks as (
    select (public.week_monday(public.kz_today()) - (7 * g))::date as ws
    from generate_series(0, greatest(1, least(p_weeks, 26)) - 1) g
  )
  select w.ws,
    coalesce(tr.total, 0)::int, coalesce(tr.done, 0)::int,
    case when coalesce(tr.total, 0) = 0 then null else round(100.0 * tr.done / tr.total)::int end,
    coalesce(br.pages, 0)::int, coalesce(br.minutes, 0)::int,
    coalesce(pl.total, 0)::int, coalesce(pl.done, 0)::int,
    coalesce(tk.done, 0)::int, coalesce(qa.done, 0)::int, coalesce(al.n, 0)::int
  from weeks w
  left join lateral (
    select count(i.id) total, count(i.id) filter (where pr.done) done
    from public.tracker_assignments a
    join public.weekly_trackers t on t.id = a.tracker_id and public.week_monday(t.week_start) = w.ws
    join public.weekly_tracker_items i on i.tracker_id = t.id
    left join public.tracker_progress pr on pr.item_id = i.id and pr.student_id = p_student
    where a.student_id = p_student
  ) tr on true
  left join lateral (
    select sum(pages_read) pages, sum(minutes_spent) minutes from public.book_reports
    where student_id = p_student and read_date between w.ws and w.ws + 6
  ) br on true
  left join lateral (
    select count(*) total, count(*) filter (where status = 'done') done from public.plans
    where student_id = p_student and plan_date between w.ws and w.ws + 6
  ) pl on true
  left join lateral (
    select count(*) done from public.task_submissions
    where student_id = p_student and submitted_at is not null
      and (submitted_at at time zone 'Asia/Almaty')::date between w.ws and w.ws + 6
  ) tk on true
  left join lateral (
    select count(*) done from public.qa_participation
    where student_id = p_student and completed_at is not null
      and (completed_at at time zone 'Asia/Almaty')::date between w.ws and w.ws + 6
  ) qa on true
  left join lateral (
    select count(*) n from public.activity_log
    where actor_id = p_student and (created_at at time zone 'Asia/Almaty')::date between w.ws and w.ws + 6
  ) al on true
  order by w.ws
$$;
grant execute on function public.student_weekly_history(uuid, int) to authenticated;

-- Топ/платформа бойынша апталық тарих (куратор — өз оқушылары, организатор — бәрі)
create or replace function public.group_weekly_history(p_curator uuid default null, p_weeks int default 8)
returns table (week_start date, avg_progress int, pages int, minutes int, tasks_done int, qa_completed int, active_students int)
language sql stable security invoker set search_path = public as $$
  with st as (
    select s.id from public.students s join public.profiles p on p.id = s.id
    where p.status = 'active' and (p_curator is null or s.curator_id = p_curator)
  ), h as (
    select st.id, x.* from st cross join lateral public.student_weekly_history(st.id, p_weeks) x
  )
  select week_start,
    round(avg(progress))::int,
    sum(pages)::int, sum(minutes)::int, sum(tasks_done)::int, sum(qa_completed)::int,
    count(*) filter (where actions > 0)::int
  from h group by week_start order by week_start
$$;
grant execute on function public.group_weekly_history(uuid, int) to authenticated;

-- Платформа статистикасы (организатор)
create or replace function public.platform_stats() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.is_organizer() then raise exception 'KOM_FORBIDDEN'; end if;
  return jsonb_build_object(
    'students_total', (select count(*) from public.profiles where role = 'student' and status in ('active', 'blocked')),
    'students_active', (select count(*) from public.profiles where role = 'student' and status = 'active'),
    'curators_total', (select count(*) from public.profiles where role = 'curator' and status in ('active', 'blocked')),
    'curators_active', (select count(*) from public.profiles where role = 'curator' and status = 'active'),
    'accounts_active', (select count(*) from public.profiles where status = 'active'),
    'accounts_blocked', (select count(*) from public.profiles where status = 'blocked'),
    'curator_requests_pending', (select count(*) from public.curator_requests where status = 'pending'),
    'student_requests_pending', (select count(*) from public.student_requests where status = 'pending'),
    'active_last_7d', (select count(*) from public.profiles where role = 'student' and status = 'active'
                       and last_active_at > now() - interval '7 days'),
    'avg_week_progress', (select round(avg(week_progress)) from public.v_student_overview where status = 'active' and week_progress is not null),
    'tasks_total', (select count(*) from public.task_submissions),
    'tasks_accepted', (select count(*) from public.task_submissions where status = 'accepted'),
    'tasks_review', (select count(*) from public.task_submissions where status = 'pending_review'),
    'pages_total', (select coalesce(sum(pages_read), 0) from public.book_reports),
    'minutes_total', (select coalesce(sum(minutes_spent), 0) from public.book_reports),
    'reports_total', (select count(*) from public.book_reports),
    'qa_assigned', (select count(*) from public.qa_video_assignments),
    'qa_completed', (select count(*) from public.qa_participation where completed_at is not null)
  );
end $$;
grant execute on function public.platform_stats() to authenticated;

-- Кураторларға шолу (организатор)
create or replace view public.v_curator_overview with (security_invoker = true) as
select
  p.id, p.full_name, p.email, p.contact_info, p.status, p.created_at, p.approved_at, p.last_active_at,
  coalesce(c.accepting_students, false) as accepting_students,
  (select count(*) from public.students s join public.profiles sp on sp.id = s.id
     where s.curator_id = p.id and sp.status = 'active')::int as students_active,
  (select count(*) from public.students s where s.curator_id = p.id)::int as students_total,
  (select count(*) from public.student_requests r where r.curator_id = p.id and r.status = 'pending')::int as requests_pending,
  (select count(*) from public.tasks t where t.curator_id = p.id)::int as tasks_created,
  (select count(*) from public.weekly_trackers t where t.curator_id = p.id)::int as trackers_created,
  (select count(*) from public.qa_videos v where v.curator_id = p.id)::int as videos_uploaded,
  (select count(*) from public.book_reports b where b.curator_id = p.id and b.status = 'submitted')::int as reports_pending,
  (select count(*) from public.activity_log l where l.actor_id = p.id and l.created_at > now() - interval '7 days')::int as actions_7d,
  (select round(avg(o.week_progress)) from public.v_student_overview o
     where o.curator_id = p.id and o.status = 'active' and o.week_progress is not null)::int as avg_week_progress
from public.profiles p
left join public.curators c on c.id = p.id
where p.role = 'curator';

grant select on public.v_curator_overview to authenticated;

-- =====================================================================
-- Storage: сұрақ-жауап видеолары (жабық bucket)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qa-videos', 'qa-videos', false, 524288000,
        array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "qa videos: curator uploads to own folder" on storage.objects for insert to authenticated
with check (
  bucket_id = 'qa-videos' and public.is_curator()
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "qa videos: read if allowed" on storage.objects for select to authenticated
using (
  bucket_id = 'qa-videos' and (
    ((storage.foldername(name))[1] = (select auth.uid())::text and public.is_curator())
    or public.is_organizer()
    or exists (
      select 1 from public.qa_videos v
      join public.qa_video_assignments a on a.video_id = v.id
      where v.storage_path = storage.objects.name
        and (public.is_self_student(a.student_id) or public.is_my_student(a.student_id))
    )
  )
);

create policy "qa videos: curator deletes own" on storage.objects for delete to authenticated
using (
  bucket_id = 'qa-videos' and public.is_curator()
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- =====================================================================
-- Realtime
-- =====================================================================
alter publication supabase_realtime add table
  public.notifications, public.tracker_progress, public.task_submissions, public.plans,
  public.book_reports, public.student_requests, public.curator_requests, public.qa_participation,
  public.tracker_assignments, public.qa_video_assignments;
