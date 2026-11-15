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

-- =====================================================================
-- KÓMEKSHI — 2-кезең: тапсырма редакторы, материалдар, тест, нәтижелер,
-- ұйымдастырушы кабинетіне код арқылы кіру
-- =====================================================================

-- ---------- Типтер ----------
create type public.task_kind as enum (
  'written', 'questions', 'essay', 'table', 'file_upload', 'external_link', 'video', 'reading', 'test'
);
create type public.question_type as enum ('single', 'multiple', 'matching', 'ordering', 'context', 'image');

-- ---------- Тапсырма параметрлері ----------
alter table public.tasks
  add column kind public.task_kind not null default 'written',
  add column external_url text
    check (external_url is null or (external_url ~* '^https?://[^[:space:]]+$' and char_length(external_url) <= 2000)),
  add column config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 100000),
  add column time_limit_minutes int
    check (time_limit_minutes is null or time_limit_minutes between 1 and 600);

alter table public.task_submissions
  add column answer_text text check (answer_text is null or char_length(answer_text) <= 50000),
  add column answer_data jsonb check (answer_data is null or pg_column_size(answer_data) <= 200000);

-- Тапсырма түріне сай баптауларды тексеру
create or replace function public.validate_task() returns trigger
language plpgsql as $$
declare v_n int; v_el jsonb;
begin
  if new.kind in ('external_link', 'video') and new.external_url is null then
    raise exception 'KOM_TASK_URL_REQUIRED';
  end if;
  if new.kind <> 'test' then
    new.time_limit_minutes := null;
  end if;
  if new.kind = 'questions' then
    if jsonb_typeof(new.config -> 'questions') <> 'array' then raise exception 'KOM_TASK_CONFIG'; end if;
    v_n := jsonb_array_length(new.config -> 'questions');
    if v_n < 1 or v_n > 50 then raise exception 'KOM_TASK_CONFIG'; end if;
    for v_el in select * from jsonb_array_elements(new.config -> 'questions') loop
      if jsonb_typeof(v_el) <> 'string' or char_length(btrim(v_el #>> '{}')) not between 1 and 1000 then
        raise exception 'KOM_TASK_CONFIG';
      end if;
    end loop;
    new.config := jsonb_build_object('questions', new.config -> 'questions');
  elsif new.kind = 'table' then
    if jsonb_typeof(new.config -> 'columns') <> 'array' or jsonb_typeof(new.config -> 'rows') <> 'number' then
      raise exception 'KOM_TASK_CONFIG';
    end if;
    v_n := jsonb_array_length(new.config -> 'columns');
    if v_n < 1 or v_n > 12 or (new.config ->> 'rows')::numeric not between 1 and 50 then raise exception 'KOM_TASK_CONFIG'; end if;
    for v_el in select * from jsonb_array_elements(new.config -> 'columns') loop
      if jsonb_typeof(v_el) <> 'string' or char_length(btrim(v_el #>> '{}')) not between 1 and 100 then
        raise exception 'KOM_TASK_CONFIG';
      end if;
    end loop;
    new.config := jsonb_build_object('columns', new.config -> 'columns', 'rows', (new.config ->> 'rows')::int);
  else
    new.config := '{}'::jsonb;
  end if;
  return new;
end $$;
create trigger validate_task before insert or update on public.tasks
  for each row execute function public.validate_task();

-- ---------- Көмекші рұқсат функциялары ----------
create or replace function public.owns_task(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = tid and t.curator_id = auth.uid()) and public.is_curator()
$$;

create or replace function public.can_view_task(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.owns_task(tid) or public.is_organizer()
    or exists (select 1 from public.task_submissions ts where ts.task_id = tid
               and (public.is_self_student(ts.student_id) or public.is_my_student(ts.student_id)))
$$;

-- ---------- Тапсырмаға тіркелген материалдар ----------
create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 500),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (char_length(mime_type) <= 150),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index task_attachments_task_idx on public.task_attachments (task_id, created_at);

-- ---------- Тест сұрақтары (дұрыс жауаптар оқушыға жабық) ----------
create table public.test_questions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  sort_order int not null default 0,
  qtype public.question_type not null,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 4000),
  context_text text check (context_text is null or char_length(context_text) <= 12000),
  image_path text check (image_path is null or char_length(image_path) <= 500),
  options jsonb not null,
  answer jsonb not null,
  explanation text check (explanation is null or char_length(explanation) <= 4000),
  points numeric(6, 2) not null default 1 check (points > 0 and points <= 100),
  created_at timestamptz not null default now()
);
create index test_questions_task_idx on public.test_questions (task_id, sort_order);

-- [{id, text}, ...] массивінен id тізімін алу (тексерумен)
create or replace function public.option_ids(p jsonb, p_min int, p_max int) returns text[]
language plpgsql immutable as $$
declare v_ids text[] := '{}'; v_el jsonb; v_id text;
begin
  if p is null or jsonb_typeof(p) <> 'array' then raise exception 'KOM_TEST_INVALID'; end if;
  if jsonb_array_length(p) < p_min or jsonb_array_length(p) > p_max then raise exception 'KOM_TEST_INVALID'; end if;
  for v_el in select * from jsonb_array_elements(p) loop
    v_id := v_el ->> 'id';
    if jsonb_typeof(v_el) <> 'object' or v_id is null or char_length(v_id) not between 1 and 40
       or jsonb_typeof(v_el -> 'text') <> 'string' or char_length(btrim(v_el ->> 'text')) not between 1 and 1000
       or v_id = any (v_ids) then
      raise exception 'KOM_TEST_INVALID';
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

create or replace function public.validate_test_question() returns trigger
language plpgsql as $$
declare v_ids text[]; v_left text[]; v_right text[]; v_given text[]; v_owner uuid; k text;
begin
  case new.qtype
    when 'single', 'context', 'image', 'multiple' then
      v_ids := public.option_ids(new.options, 2, 10);
      if new.qtype = 'multiple' then
        if jsonb_typeof(new.answer -> 'correct') <> 'array' then raise exception 'KOM_TEST_INVALID'; end if;
        select coalesce(array_agg(distinct x), '{}') into v_given from jsonb_array_elements_text(new.answer -> 'correct') x;
        if cardinality(v_given) < 1 or cardinality(v_given) <> jsonb_array_length(new.answer -> 'correct')
           or not (v_given <@ v_ids) then
          raise exception 'KOM_TEST_INVALID';
        end if;
        new.answer := jsonb_build_object('correct', to_jsonb(v_given));
      else
        if jsonb_typeof(new.answer -> 'correct') <> 'string' or not ((new.answer ->> 'correct') = any (v_ids)) then
          raise exception 'KOM_TEST_INVALID';
        end if;
        new.answer := jsonb_build_object('correct', new.answer -> 'correct');
      end if;
    when 'ordering' then
      v_ids := public.option_ids(new.options, 2, 10);
      if jsonb_typeof(new.answer -> 'order') <> 'array' then raise exception 'KOM_TEST_INVALID'; end if;
      select coalesce(array_agg(x), '{}') into v_given from jsonb_array_elements_text(new.answer -> 'order') x;
      if cardinality(v_given) <> cardinality(v_ids) or not (v_given <@ v_ids and v_ids <@ v_given) then
        raise exception 'KOM_TEST_INVALID';
      end if;
      new.answer := jsonb_build_object('order', new.answer -> 'order');
    when 'matching' then
      if jsonb_typeof(new.options) <> 'object' then raise exception 'KOM_TEST_INVALID'; end if;
      v_left := public.option_ids(new.options -> 'left', 2, 10);
      v_right := public.option_ids(new.options -> 'right', 2, 12);
      if cardinality(v_right) < cardinality(v_left) or v_left && v_right then raise exception 'KOM_TEST_INVALID'; end if;
      if jsonb_typeof(new.answer -> 'pairs') <> 'object' then raise exception 'KOM_TEST_INVALID'; end if;
      foreach k in array v_left loop
        if not ((new.answer -> 'pairs' ->> k) = any (v_right)) then raise exception 'KOM_TEST_INVALID'; end if;
      end loop;
      select coalesce(array_agg(distinct e.value), '{}') into v_given
        from jsonb_each_text(new.answer -> 'pairs') e where e.key = any (v_left);
      if cardinality(v_given) <> cardinality(v_left) then raise exception 'KOM_TEST_INVALID'; end if;
      new.options := jsonb_build_object('left', new.options -> 'left', 'right', new.options -> 'right');
      new.answer := jsonb_build_object('pairs', (select jsonb_object_agg(e.key, e.value)
        from jsonb_each(new.answer -> 'pairs') e where e.key = any (v_left)));
  end case;

  if new.qtype = 'context' and (new.context_text is null or btrim(new.context_text) = '') then
    raise exception 'KOM_TEST_INVALID';
  end if;
  if new.qtype = 'image' and new.image_path is null then
    raise exception 'KOM_TEST_INVALID';
  end if;
  if new.image_path is not null then
    select curator_id into v_owner from public.tasks where id = new.task_id;
    if split_part(new.image_path, '/', 1) <> coalesce(v_owner::text, '') then raise exception 'KOM_FORBIDDEN'; end if;
  end if;
  new.prompt := btrim(new.prompt);
  new.explanation := nullif(btrim(coalesce(new.explanation, '')), '');
  new.context_text := nullif(btrim(coalesce(new.context_text, '')), '');
  return new;
end $$;
create trigger validate_test_question before insert or update on public.test_questions
  for each row execute function public.validate_test_question();

-- ---------- Тест тапсыру әрекеттері ----------
create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.task_submissions (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  attempt_no int not null default 1,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  answers jsonb,
  score numeric(8, 2),
  max_score numeric(8, 2),
  late boolean not null default false
);
create index test_attempts_student_idx on public.test_attempts (student_id);
create index test_attempts_task_idx on public.test_attempts (task_id);

-- ---------- Оқушы жіберген файлдар ----------
create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.task_submissions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 500),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (char_length(mime_type) <= 150),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index submission_files_submission_idx on public.submission_files (submission_id);

-- ---------- Тапсырма тапсыруды қорғау (жауап өрістерімен толықтырылған) ----------
create or replace function public.guard_task_submissions() returns trigger
language plpgsql as $$
declare v_kind public.task_kind;
begin
  if tg_op = 'INSERT' then
    if public.is_client() then
      new.status := 'new';
      new.student_comment := null;
      new.curator_comment := null;
      new.answer_text := null;
      new.answer_data := null;
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
    select kind into v_kind from public.tasks where id = old.task_id;

    if auth.uid() = old.student_id then
      -- Оқушы
      if new.curator_comment is distinct from old.curator_comment
         or new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'KOM_FORBIDDEN';
      end if;
      if (new.answer_text is distinct from old.answer_text or new.answer_data is distinct from old.answer_data)
         and old.status in ('pending_review', 'accepted') then
        raise exception 'KOM_TASK_LOCKED';
      end if;
      if new.status <> old.status then
        if old.status = 'accepted' then
          raise exception 'KOM_TASK_ALREADY_ACCEPTED';
        end if;
        if new.status not in ('in_progress', 'pending_review') then
          raise exception 'KOM_FORBIDDEN';
        end if;
        -- Тест тек start_test / submit_test арқылы тапсырылады
        if v_kind = 'test' and (new.status = 'pending_review' or old.status = 'pending_review') then
          raise exception 'KOM_TEST_USE_RUNNER';
        end if;
        if new.status = 'pending_review' then
          new.submitted_at := now();
        end if;
      end if;
    else
      -- Куратор
      if new.student_comment is distinct from old.student_comment
         or new.submitted_at is distinct from old.submitted_at
         or new.answer_text is distinct from old.answer_text
         or new.answer_data is distinct from old.answer_data then
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

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.task_attachments enable row level security;
alter table public.test_questions   enable row level security;
alter table public.test_attempts    enable row level security;
alter table public.submission_files enable row level security;
revoke all on public.task_attachments, public.test_questions, public.test_attempts, public.submission_files from anon;

create policy attachments_select on public.task_attachments for select to authenticated using (public.can_view_task(task_id));
create policy attachments_insert on public.task_attachments for insert to authenticated with check (
  public.owns_task(task_id) and split_part(storage_path, '/', 1) = (select auth.uid())::text
);
create policy attachments_delete on public.task_attachments for delete to authenticated using (public.owns_task(task_id));
revoke update on public.task_attachments from authenticated;

-- Оқушы сұрақтарды тікелей оқи алмайды — тек start_test / test_result арқылы
create policy questions_select on public.test_questions for select to authenticated using (
  public.owns_task(task_id) or public.is_organizer()
);
create policy questions_insert on public.test_questions for insert to authenticated with check (public.owns_task(task_id));
create policy questions_update on public.test_questions for update to authenticated
  using (public.owns_task(task_id)) with check (public.owns_task(task_id));
create policy questions_delete on public.test_questions for delete to authenticated using (public.owns_task(task_id));

create policy attempts_select on public.test_attempts for select to authenticated using (public.can_view_student(student_id));
revoke insert, update, delete on public.test_attempts from authenticated;

create policy sfiles_select on public.submission_files for select to authenticated using (public.can_view_student(student_id));
create policy sfiles_insert on public.submission_files for insert to authenticated with check (
  public.is_self_student(student_id)
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and exists (select 1 from public.task_submissions s where s.id = submission_id and s.student_id = submission_files.student_id
              and s.status in ('new', 'in_progress', 'needs_revision'))
);
create policy sfiles_delete on public.submission_files for delete to authenticated using (
  public.is_self_student(student_id)
  and exists (select 1 from public.task_submissions s where s.id = submission_id
              and s.status in ('new', 'in_progress', 'needs_revision'))
);
revoke update on public.submission_files from authenticated;

-- =====================================================================
-- Тестті бағалау
-- =====================================================================
create or replace function public.grade_answer(
  p_type public.question_type, p_key jsonb, p_given jsonb, p_points numeric
) returns numeric
language plpgsql immutable as $$
declare v_total int; v_ok int;
begin
  if p_given is null or jsonb_typeof(p_given) = 'null' then return 0; end if;
  if p_type in ('single', 'context', 'image') then
    return case when jsonb_typeof(p_given) = 'string' and (p_given #>> '{}') = (p_key ->> 'correct') then p_points else 0 end;
  elsif p_type = 'multiple' then
    if jsonb_typeof(p_given) <> 'array' then return 0; end if;
    return case when
      (select coalesce(array_agg(x order by x), '{}') from (select distinct jsonb_array_elements_text(p_given) x) a)
      = (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(p_key -> 'correct') x)
      then p_points else 0 end;
  elsif p_type = 'ordering' then
    return case when jsonb_typeof(p_given) = 'array' and p_given = (p_key -> 'order') then p_points else 0 end;
  elsif p_type = 'matching' then
    if jsonb_typeof(p_given) <> 'object' then return 0; end if;
    select count(*) into v_total from jsonb_object_keys(p_key -> 'pairs');
    select count(*) into v_ok from jsonb_each_text(p_key -> 'pairs') e where (p_given ->> e.key) = e.value;
    return round(p_points * v_ok / greatest(v_total, 1), 2);
  end if;
  return 0;
end $$;

-- Оқушы тестті бастайды: дұрыс жауаптарсыз сұрақтар қайтарылады
create or replace function public.start_test(p_submission uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sub public.task_submissions; v_task public.tasks; v_att public.test_attempts; v_qs jsonb;
begin
  select * into v_sub from public.task_submissions where id = p_submission;
  if not found or not public.is_self_student(v_sub.student_id) then raise exception 'KOM_FORBIDDEN'; end if;
  select * into v_task from public.tasks where id = v_sub.task_id;
  if v_task.kind <> 'test' then raise exception 'KOM_NOT_A_TEST'; end if;
  if v_sub.status = 'accepted' then raise exception 'KOM_TASK_ALREADY_ACCEPTED'; end if;

  select * into v_att from public.test_attempts where submission_id = p_submission;
  if found then
    if v_att.finished_at is not null then
      if v_sub.status <> 'needs_revision' then raise exception 'KOM_TEST_DONE'; end if;
      update public.test_attempts
        set started_at = now(), finished_at = null, answers = null, score = null, max_score = null,
            late = false, attempt_no = attempt_no + 1
        where id = v_att.id returning * into v_att;
    end if;
  else
    insert into public.test_attempts (submission_id, task_id, student_id)
    values (p_submission, v_task.id, v_sub.student_id) returning * into v_att;
  end if;

  if v_sub.status in ('new', 'needs_revision') then
    update public.task_submissions set status = 'in_progress' where id = p_submission;
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.sort_order), '[]'::jsonb) into v_qs from (
    select tq.id, tq.sort_order, tq.qtype, tq.prompt, tq.context_text, tq.image_path, tq.points,
      case tq.qtype
        when 'matching' then jsonb_build_object(
          'left', tq.options -> 'left',
          'right', (select jsonb_agg(e order by random()) from jsonb_array_elements(tq.options -> 'right') e))
        when 'ordering' then (select jsonb_agg(e order by random()) from jsonb_array_elements(tq.options) e)
        else tq.options
      end as options
    from public.test_questions tq where tq.task_id = v_task.id
  ) q;

  return jsonb_build_object(
    'attempt_no', v_att.attempt_no,
    'started_at', v_att.started_at,
    'server_now', now(),
    'time_limit_minutes', v_task.time_limit_minutes,
    'questions', v_qs
  );
end $$;

-- Нәтиже: оқушыға тек тест аяқталғаннан кейін, кураторға/организаторға әрқашан
create or replace function public.test_result(p_submission uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sub public.task_submissions; v_att public.test_attempts; v_items jsonb;
begin
  select * into v_sub from public.task_submissions where id = p_submission;
  if not found or not public.can_view_student(v_sub.student_id) then raise exception 'KOM_FORBIDDEN'; end if;
  select * into v_att from public.test_attempts where submission_id = p_submission;
  if not found then return null; end if;
  if v_att.finished_at is null then
    return jsonb_build_object('attempt_no', v_att.attempt_no, 'started_at', v_att.started_at, 'finished_at', null);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'qtype', q.qtype, 'prompt', q.prompt, 'context_text', q.context_text, 'image_path', q.image_path,
      'options', q.options, 'answer', q.answer, 'explanation', q.explanation, 'points', q.points,
      'given', v_att.answers -> (q.id::text),
      'earned', public.grade_answer(q.qtype, q.answer, v_att.answers -> (q.id::text), q.points)
    ) order by q.sort_order), '[]'::jsonb)
    into v_items from public.test_questions q where q.task_id = v_sub.task_id;
  return jsonb_build_object(
    'attempt_no', v_att.attempt_no, 'started_at', v_att.started_at, 'finished_at', v_att.finished_at,
    'duration_seconds', extract(epoch from (v_att.finished_at - v_att.started_at))::int,
    'late', v_att.late, 'score', v_att.score, 'max_score', v_att.max_score, 'items', v_items
  );
end $$;

-- Оқушы жауаптарын жібереді — сервер бағалайды
create or replace function public.submit_test(p_submission uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sub public.task_submissions; v_task public.tasks; v_att public.test_attempts;
        v_answers jsonb; v_score numeric; v_max numeric; v_late boolean;
begin
  select * into v_sub from public.task_submissions where id = p_submission;
  if not found or not public.is_self_student(v_sub.student_id) then raise exception 'KOM_FORBIDDEN'; end if;
  select * into v_task from public.tasks where id = v_sub.task_id;
  if v_task.kind <> 'test' then raise exception 'KOM_NOT_A_TEST'; end if;
  select * into v_att from public.test_attempts where submission_id = p_submission for update;
  if not found then raise exception 'KOM_TEST_NOT_STARTED'; end if;
  if v_att.finished_at is not null then raise exception 'KOM_TEST_DONE'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 200000 then
    p_answers := '{}'::jsonb;
  end if;

  -- Тек осы тесттің сұрақтарына берілген жауаптарды сақтаймыз
  select coalesce(jsonb_object_agg(q.id::text, p_answers -> (q.id::text)) filter (where p_answers ? (q.id::text)), '{}'::jsonb),
         coalesce(sum(public.grade_answer(q.qtype, q.answer, p_answers -> (q.id::text), q.points)), 0),
         coalesce(sum(q.points), 0)
    into v_answers, v_score, v_max
    from public.test_questions q where q.task_id = v_task.id;

  v_late := v_task.time_limit_minutes is not null
            and now() > v_att.started_at + make_interval(mins => v_task.time_limit_minutes) + interval '60 seconds';

  update public.test_attempts
    set finished_at = now(), answers = v_answers, score = v_score, max_score = v_max, late = v_late
    where id = v_att.id;
  update public.task_submissions set status = 'pending_review', submitted_at = now() where id = p_submission;
  perform public.log_activity('test_submitted', 'task_submission', p_submission,
    jsonb_build_object('score', v_score, 'max', v_max, 'late', v_late));
  return public.test_result(p_submission);
end $$;

revoke execute on function public.start_test(uuid) from public, anon;
revoke execute on function public.submit_test(uuid, jsonb) from public, anon;
revoke execute on function public.test_result(uuid) from public, anon;
grant execute on function public.start_test(uuid) to authenticated;
grant execute on function public.submit_test(uuid, jsonb) to authenticated;
grant execute on function public.test_result(uuid) to authenticated;

-- =====================================================================
-- Куратор: толық тапсырма жасау және өңдеу
-- p_task: {title, description, instructions, start_date, due_date, priority, kind, external_url, config, time_limit_minutes}
-- p_questions: [{qtype, prompt, context_text, image_path, options, answer, explanation, points}]
-- p_attachments: [{storage_path, file_name, mime_type, size_bytes}]
-- =====================================================================
create or replace function public.insert_test_questions(p_task uuid, p_questions jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare v_q jsonb; v_i int := 0;
begin
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'KOM_TEST_EMPTY';
  end if;
  if jsonb_array_length(p_questions) > 200 then raise exception 'KOM_TEST_INVALID'; end if;
  for v_q in select * from jsonb_array_elements(p_questions) loop
    v_i := v_i + 1;
    insert into public.test_questions (task_id, sort_order, qtype, prompt, context_text, image_path, options, answer, explanation, points)
    values (p_task, v_i, (v_q ->> 'qtype')::public.question_type, coalesce(v_q ->> 'prompt', ''),
            v_q ->> 'context_text', nullif(v_q ->> 'image_path', ''), v_q -> 'options', v_q -> 'answer',
            v_q ->> 'explanation', coalesce((v_q ->> 'points')::numeric, 1));
  end loop;
end $$;

create or replace function public.create_task_v2(
  p_task jsonb, p_students uuid[], p_questions jsonb default null, p_attachments jsonb default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_sid uuid; v_a jsonb; v_kind public.task_kind;
begin
  if p_students is null or cardinality(p_students) = 0 then raise exception 'KOM_NO_STUDENTS'; end if;
  v_kind := coalesce(nullif(p_task ->> 'kind', ''), 'written')::public.task_kind;
  insert into public.tasks (curator_id, title, description, instructions, start_date, due_date, priority,
                            kind, external_url, config, time_limit_minutes)
  values (auth.uid(), btrim(coalesce(p_task ->> 'title', '')),
          nullif(btrim(coalesce(p_task ->> 'description', '')), ''),
          nullif(btrim(coalesce(p_task ->> 'instructions', '')), ''),
          coalesce(nullif(p_task ->> 'start_date', '')::date, public.kz_today()),
          (p_task ->> 'due_date')::date,
          coalesce(nullif(p_task ->> 'priority', ''), 'medium')::public.priority_level,
          v_kind, nullif(btrim(coalesce(p_task ->> 'external_url', '')), ''),
          coalesce(p_task -> 'config', '{}'::jsonb),
          nullif(p_task ->> 'time_limit_minutes', '')::int)
  returning id into v_id;

  if v_kind = 'test' then
    perform public.insert_test_questions(v_id, p_questions);
  end if;

  if p_attachments is not null and jsonb_typeof(p_attachments) = 'array' then
    if jsonb_array_length(p_attachments) > 20 then raise exception 'KOM_TOO_MANY_FILES'; end if;
    for v_a in select * from jsonb_array_elements(p_attachments) loop
      insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
      values (v_id, v_a ->> 'storage_path', v_a ->> 'file_name', v_a ->> 'mime_type', (v_a ->> 'size_bytes')::bigint);
    end loop;
  end if;

  foreach v_sid in array p_students loop
    insert into public.task_submissions (task_id, student_id) values (v_id, v_sid);
  end loop;
  return v_id;
end $$;

create or replace function public.update_task_v2(
  p_task_id uuid, p_task jsonb, p_questions jsonb default null, p_add_students uuid[] default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare v_sid uuid; v_kind public.task_kind;
begin
  if not public.owns_task(p_task_id) then raise exception 'KOM_FORBIDDEN'; end if;
  update public.tasks set
    title = btrim(coalesce(p_task ->> 'title', title)),
    description = nullif(btrim(coalesce(p_task ->> 'description', '')), ''),
    instructions = nullif(btrim(coalesce(p_task ->> 'instructions', '')), ''),
    start_date = coalesce(nullif(p_task ->> 'start_date', '')::date, start_date),
    due_date = coalesce(nullif(p_task ->> 'due_date', '')::date, due_date),
    priority = coalesce(nullif(p_task ->> 'priority', ''), priority::text)::public.priority_level,
    external_url = nullif(btrim(coalesce(p_task ->> 'external_url', '')), ''),
    config = coalesce(p_task -> 'config', config),
    time_limit_minutes = nullif(p_task ->> 'time_limit_minutes', '')::int
  where id = p_task_id
  returning kind into v_kind;

  if p_questions is not null and v_kind = 'test' then
    if exists (select 1 from public.test_attempts where task_id = p_task_id) then
      raise exception 'KOM_TEST_HAS_ATTEMPTS';
    end if;
    delete from public.test_questions where task_id = p_task_id;
    perform public.insert_test_questions(p_task_id, p_questions);
  end if;

  if p_add_students is not null then
    foreach v_sid in array p_add_students loop
      if not exists (select 1 from public.task_submissions where task_id = p_task_id and student_id = v_sid) then
        insert into public.task_submissions (task_id, student_id) values (p_task_id, v_sid);
      end if;
    end loop;
  end if;
end $$;

revoke execute on function public.insert_test_questions(uuid, jsonb) from public, anon;
revoke execute on function public.create_task_v2(jsonb, uuid[], jsonb, jsonb) from public, anon;
revoke execute on function public.update_task_v2(uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.insert_test_questions(uuid, jsonb) to authenticated;
grant execute on function public.create_task_v2(jsonb, uuid[], jsonb, jsonb) to authenticated;
grant execute on function public.update_task_v2(uuid, jsonb, jsonb, uuid[]) to authenticated;

-- =====================================================================
-- Storage: тапсырма материалдары және оқушы файлдары (жабық bucket)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-files', 'task-files', false, 52428800, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/webp',
  'text/plain'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_read_task_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_organizer()
    or exists (select 1 from public.task_attachments a where a.storage_path = p_name and public.can_view_task(a.task_id))
    or exists (select 1 from public.test_questions q where q.image_path = p_name and public.can_view_task(q.task_id))
    or exists (select 1 from public.submission_files f where f.storage_path = p_name and public.can_view_student(f.student_id))
$$;

create policy "task files: upload to own folder" on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (public.is_curator() or public.is_student())
);

create policy "task files: read if allowed" on storage.objects for select to authenticated
using (
  bucket_id = 'task-files' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.can_read_task_file(name)
  )
);

create policy "task files: delete own" on storage.objects for delete to authenticated
using (
  bucket_id = 'task-files' and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- =====================================================================
-- Ұйымдастырушы кабинетіне код арқылы кіру
-- Код пен сервер құпиясы тек хэш түрінде, клиентке жабық схемада сақталады.
-- =====================================================================
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.org_gate (
  id int primary key default 1 check (id = 1),
  code_hash text not null,
  secret_hash text not null,
  updated_at timestamptz not null default now()
);

create table private.org_gate_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index org_gate_attempts_ip_idx on private.org_gate_attempts (ip_hash, created_at desc);
create index org_gate_attempts_created_idx on private.org_gate_attempts (created_at desc);

-- Тек серверден (құпия кілтпен) шақырылады. Нәтиже: ok | bad | locked | denied | disabled
create or replace function public.org_gate_check(p_secret text, p_ip text, p_code text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare g private.org_gate; v_ip text := left(coalesce(nullif(p_ip, ''), 'unknown'), 128);
        v_fail_ip int; v_fail_all int; v_ok boolean;
begin
  select * into g from private.org_gate where id = 1;
  if not found then return 'disabled'; end if;
  if p_secret is null or crypt(p_secret, g.secret_hash) <> g.secret_hash then return 'denied'; end if;

  select count(*) into v_fail_ip from private.org_gate_attempts
    where ip_hash = v_ip and not ok and created_at > now() - interval '15 minutes';
  select count(*) into v_fail_all from private.org_gate_attempts
    where not ok and created_at > now() - interval '15 minutes';
  if v_fail_ip >= 5 or v_fail_all >= 50 then
    insert into public.activity_log (actor_id, action, entity, meta)
    values (null, 'organizer_code_locked', 'organizer_gate', jsonb_build_object('ip', v_ip));
    return 'locked';
  end if;

  v_ok := coalesce(p_code, '') ~ '^[0-9]{4,12}$' and crypt(p_code, g.code_hash) = g.code_hash;
  insert into private.org_gate_attempts (ip_hash, ok) values (v_ip, v_ok);
  insert into public.activity_log (actor_id, action, entity, meta)
  values (null, case when v_ok then 'organizer_code_ok' else 'organizer_code_fail' end, 'organizer_gate',
          jsonb_build_object('ip', v_ip));
  return case when v_ok then 'ok' else 'bad' end;
end $$;
revoke execute on function public.org_gate_check(text, text, text) from public;
grant execute on function public.org_gate_check(text, text, text) to anon, authenticated;

-- Кодты орнату/ауыстыру: тек service_role (немесе SQL Editor)
create or replace function public.admin_set_org_gate(p_code text, p_secret text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if coalesce(p_code, '') !~ '^[0-9]{4,12}$' or char_length(coalesce(p_secret, '')) < 24 then
    raise exception 'KOM_GATE_INVALID';
  end if;
  insert into private.org_gate (id, code_hash, secret_hash)
  values (1, crypt(p_code, gen_salt('bf', 10)), crypt(p_secret, gen_salt('bf', 8)))
  on conflict (id) do update set code_hash = excluded.code_hash, secret_hash = excluded.secret_hash, updated_at = now();
end $$;
revoke execute on function public.admin_set_org_gate(text, text) from public, anon, authenticated;
grant execute on function public.admin_set_org_gate(text, text) to service_role;

-- =====================================================================
-- Realtime
-- =====================================================================
alter publication supabase_realtime add table public.test_attempts, public.submission_files;

-- =====================================================================
-- KÓMEKSHI — тапсырмалар v3
--  1) Тапсырманы өшіру (soft delete): бір оқушыдан немесе барлық оқушыдан.
--     Өшірілген жазбалар физикалық жойылмайды, тек организатор архивтен көре алады.
--  2) Тапсырманың кезеңі: жыл, ай (1–12) және айдың аптасы (1–5).
--     Апта күнтізбелік күндермен байланысты: 1-апта = 1–7, 2-апта = 8–14,
--     3-апта = 15–21, 4-апта = 22–28, 5-апта = 29–айдың соңы (айда 28-ден көп күн болса ғана).
-- =====================================================================

-- ---------- Бағандар ----------
alter table public.tasks
  add column period_year smallint,
  add column period_month smallint,
  add column period_week smallint,
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles (id) on delete set null;

alter table public.task_submissions
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles (id) on delete set null;

-- Бар тапсырмаларды басталу күні бойынша кезеңге тіркеу
update public.tasks set
  period_year = extract(year from start_date)::smallint,
  period_month = extract(month from start_date)::smallint,
  period_week = least(5, ceil(extract(day from start_date) / 7.0))::smallint;

alter table public.tasks
  alter column period_year set not null,
  alter column period_month set not null,
  alter column period_week set not null,
  add constraint tasks_period_month_chk check (period_month between 1 and 12),
  add constraint tasks_period_week_chk check (period_week between 1 and 5),
  add constraint tasks_period_year_chk check (period_year between 2020 and 2100);

create index tasks_period_idx on public.tasks (period_year, period_month, period_week);
create index task_submissions_alive_idx on public.task_submissions (student_id) where deleted_at is null;

-- Айдағы апта нөмірінің күнтізбелік аралығы
create or replace function public.period_week_range(p_year int, p_month int, p_week int)
returns table (week_start date, week_end date)
language sql immutable set search_path = public as $$
  select d, least(d + 6, (date_trunc('month', d) + interval '1 month - 1 day')::date)
  from (select make_date(p_year, p_month, 1) + (p_week - 1) * 7 as d) x
$$;
grant execute on function public.period_week_range(int, int, int) to authenticated;

-- ---------- Тапсырма: кезең және өшіру күзеті ----------
create or replace function public.guard_task_period() returns trigger
language plpgsql set search_path = public as $$
declare v_days int;
begin
  if tg_op = 'UPDATE' and public.is_client() then
    if new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
      raise exception 'KOM_FORBIDDEN';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.deleted_at := null;
    new.deleted_by := null;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is not null then
    raise exception 'KOM_TASK_DELETED';
  end if;

  if new.period_year is null or new.period_month is null or new.period_week is null then
    new.period_year := coalesce(new.period_year, extract(year from new.start_date)::smallint);
    new.period_month := coalesce(new.period_month, extract(month from new.start_date)::smallint);
    new.period_week := coalesce(new.period_week, least(5, ceil(extract(day from new.start_date) / 7.0))::smallint);
  end if;
  if new.period_month not between 1 and 12 or new.period_week not between 1 and 5
     or new.period_year not between 2020 and 2100 then
    raise exception 'KOM_TASK_PERIOD';
  end if;
  v_days := extract(day from (make_date(new.period_year, new.period_month, 1) + interval '1 month - 1 day'))::int;
  if new.period_week = 5 and v_days <= 28 then
    raise exception 'KOM_TASK_PERIOD';
  end if;
  return new;
end $$;

create trigger guard_task_period before insert or update on public.tasks
  for each row execute function public.guard_task_period();

-- ---------- Оқушыға берілген тапсырма: өшіру күзеті ----------
create or replace function public.guard_submission_deleted() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.deleted_at := null;
    new.deleted_by := null;
    return new;
  end if;
  -- Өшірілген жазбаны өзгертуге болмайды (тек қайта тағайындау кезінде қалпына келтіріледі)
  if old.deleted_at is not null and new.deleted_at is not null then
    raise exception 'KOM_TASK_DELETED';
  end if;
  if public.is_client() and (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by) then
    raise exception 'KOM_FORBIDDEN';
  end if;
  return new;
end $$;

create trigger guard_submission_deleted before insert or update on public.task_submissions
  for each row execute function public.guard_submission_deleted();

-- Өшірілген тапсырманың тестін бастауға/тапсыруға болмайды
create or replace function public.guard_attempt_alive() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.task_submissions s where s.id = new.submission_id and s.deleted_at is not null) then
    raise exception 'KOM_TASK_DELETED';
  end if;
  return new;
end $$;

create trigger guard_attempt_alive before insert or update on public.test_attempts
  for each row execute function public.guard_attempt_alive();

-- ---------- Көру құқықтары: өшірілгендер барлық кабинеттен жасырылады ----------
create or replace function public.owns_task(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = tid and t.curator_id = auth.uid() and t.deleted_at is null)
    and public.is_curator()
$$;

create or replace function public.can_view_task(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = tid and t.deleted_at is null)
    and (
      public.owns_task(tid) or public.is_organizer()
      or exists (select 1 from public.task_submissions ts where ts.task_id = tid and ts.deleted_at is null
                 and (public.is_self_student(ts.student_id) or public.is_my_student(ts.student_id)))
    )
$$;

drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (
  deleted_at is null and (
    (curator_id = (select auth.uid()) and public.is_curator())
    or public.is_organizer()
    or exists (select 1 from public.task_submissions ts where ts.task_id = tasks.id
               and (public.is_self_student(ts.student_id) or public.is_my_student(ts.student_id)))
  )
);

drop policy tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (curator_id = (select auth.uid()) and public.is_curator() and deleted_at is null)
  with check (curator_id = (select auth.uid()));

-- Физикалық өшіру клиенттен мүмкін емес (тек soft delete RPC арқылы)
drop policy tasks_delete on public.tasks;
drop policy submissions_delete on public.task_submissions;

drop policy submissions_select on public.task_submissions;
create policy submissions_select on public.task_submissions for select to authenticated
  using (deleted_at is null and public.can_view_student(student_id));

drop policy submissions_update on public.task_submissions;
create policy submissions_update on public.task_submissions for update to authenticated
  using (deleted_at is null and (public.is_self_student(student_id) or public.is_my_student(student_id)))
  with check (public.is_self_student(student_id) or public.is_my_student(student_id));

drop policy attempts_select on public.test_attempts;
create policy attempts_select on public.test_attempts for select to authenticated using (
  public.can_view_student(student_id)
  and exists (select 1 from public.task_submissions s where s.id = submission_id)
);

drop policy sfiles_select on public.submission_files;
create policy sfiles_select on public.submission_files for select to authenticated using (
  public.can_view_student(student_id)
  and exists (select 1 from public.task_submissions s where s.id = submission_id)
);

-- ---------- Өшіру RPC ----------
-- Бір оқушыдан өшіру
create or replace function public.delete_task_assignment(p_submission uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_task uuid; v_student uuid; v_title text;
begin
  select s.task_id, s.student_id, t.title into v_task, v_student, v_title
  from public.task_submissions s join public.tasks t on t.id = s.task_id
  where s.id = p_submission and s.deleted_at is null and t.deleted_at is null;
  if v_task is null then raise exception 'KOM_NOT_FOUND'; end if;
  if not public.owns_task(v_task) or not public.is_my_student(v_student) then raise exception 'KOM_FORBIDDEN'; end if;

  update public.task_submissions set deleted_at = now(), deleted_by = auth.uid() where id = p_submission;
  perform public.notify(v_student, 'task_removed', 'Тапсырма алынып тасталды', v_title, '/student/tasks', v_task);
  perform public.log_activity('task.assignment_deleted', 'task_submission', p_submission,
                              jsonb_build_object('task_id', v_task, 'student_id', v_student));

  -- Соңғы оқушыдан да өшірілсе, тапсырманың өзі де архивке өтеді
  if not exists (select 1 from public.task_submissions where task_id = v_task and deleted_at is null) then
    update public.tasks set deleted_at = now(), deleted_by = auth.uid() where id = v_task;
    perform public.log_activity('task.deleted', 'task', v_task, jsonb_build_object('reason', 'last_assignment'));
  end if;
end $$;

-- Барлық оқушыдан өшіру
create or replace function public.delete_task(p_task uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_title text; v_n int; r record;
begin
  if not public.owns_task(p_task) then raise exception 'KOM_FORBIDDEN'; end if;
  select title into v_title from public.tasks where id = p_task;

  for r in select id, student_id from public.task_submissions where task_id = p_task and deleted_at is null loop
    perform public.notify(r.student_id, 'task_removed', 'Тапсырма алынып тасталды', v_title, '/student/tasks', p_task);
  end loop;
  update public.task_submissions set deleted_at = now(), deleted_by = auth.uid()
  where task_id = p_task and deleted_at is null;
  get diagnostics v_n = row_count;
  update public.tasks set deleted_at = now(), deleted_by = auth.uid() where id = p_task;
  perform public.log_activity('task.deleted', 'task', p_task, jsonb_build_object('students', v_n));
  return v_n;
end $$;

revoke all on function public.delete_task_assignment(uuid) from public, anon;
revoke all on function public.delete_task(uuid) from public, anon;
grant execute on function public.delete_task_assignment(uuid) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;

-- Тапсырмаға оқушы қосу (бұрын өшірілген болса, қалпына келтіріледі)
create or replace function public.assign_task_student(p_task uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_task(p_task) or not public.is_my_student(p_student) then raise exception 'KOM_FORBIDDEN'; end if;
  if exists (select 1 from public.task_submissions where task_id = p_task and student_id = p_student and deleted_at is not null) then
    update public.task_submissions set deleted_at = null, deleted_by = null
    where task_id = p_task and student_id = p_student;
  elsif not exists (select 1 from public.task_submissions where task_id = p_task and student_id = p_student) then
    insert into public.task_submissions (task_id, student_id) values (p_task, p_student);
  end if;
end $$;
revoke all on function public.assign_task_student(uuid, uuid) from public, anon;
grant execute on function public.assign_task_student(uuid, uuid) to authenticated;

-- ---------- Тапсырма құру/өзгерту: кезең өрістері ----------
create or replace function public.create_task_v2(
  p_task jsonb, p_students uuid[], p_questions jsonb default null, p_attachments jsonb default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_sid uuid; v_a jsonb; v_kind public.task_kind;
begin
  if p_students is null or cardinality(p_students) = 0 then raise exception 'KOM_NO_STUDENTS'; end if;
  v_kind := coalesce(nullif(p_task ->> 'kind', ''), 'written')::public.task_kind;
  insert into public.tasks (curator_id, title, description, instructions, start_date, due_date, priority,
                            kind, external_url, config, time_limit_minutes, period_year, period_month, period_week)
  values (auth.uid(), btrim(coalesce(p_task ->> 'title', '')),
          nullif(btrim(coalesce(p_task ->> 'description', '')), ''),
          nullif(btrim(coalesce(p_task ->> 'instructions', '')), ''),
          coalesce(nullif(p_task ->> 'start_date', '')::date, public.kz_today()),
          (p_task ->> 'due_date')::date,
          coalesce(nullif(p_task ->> 'priority', ''), 'medium')::public.priority_level,
          v_kind, nullif(btrim(coalesce(p_task ->> 'external_url', '')), ''),
          coalesce(p_task -> 'config', '{}'::jsonb),
          nullif(p_task ->> 'time_limit_minutes', '')::int,
          nullif(p_task ->> 'period_year', '')::smallint,
          nullif(p_task ->> 'period_month', '')::smallint,
          nullif(p_task ->> 'period_week', '')::smallint)
  returning id into v_id;

  if v_kind = 'test' then
    perform public.insert_test_questions(v_id, p_questions);
  end if;

  if p_attachments is not null and jsonb_typeof(p_attachments) = 'array' then
    if jsonb_array_length(p_attachments) > 20 then raise exception 'KOM_TOO_MANY_FILES'; end if;
    for v_a in select * from jsonb_array_elements(p_attachments) loop
      insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
      values (v_id, v_a ->> 'storage_path', v_a ->> 'file_name', v_a ->> 'mime_type', (v_a ->> 'size_bytes')::bigint);
    end loop;
  end if;

  foreach v_sid in array p_students loop
    insert into public.task_submissions (task_id, student_id) values (v_id, v_sid);
  end loop;
  return v_id;
end $$;

create or replace function public.update_task_v2(
  p_task_id uuid, p_task jsonb, p_questions jsonb default null, p_add_students uuid[] default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare v_sid uuid; v_kind public.task_kind;
begin
  if not public.owns_task(p_task_id) then raise exception 'KOM_FORBIDDEN'; end if;
  update public.tasks set
    title = btrim(coalesce(p_task ->> 'title', title)),
    description = nullif(btrim(coalesce(p_task ->> 'description', '')), ''),
    instructions = nullif(btrim(coalesce(p_task ->> 'instructions', '')), ''),
    start_date = coalesce(nullif(p_task ->> 'start_date', '')::date, start_date),
    due_date = coalesce(nullif(p_task ->> 'due_date', '')::date, due_date),
    priority = coalesce(nullif(p_task ->> 'priority', ''), priority::text)::public.priority_level,
    external_url = nullif(btrim(coalesce(p_task ->> 'external_url', '')), ''),
    config = coalesce(p_task -> 'config', config),
    time_limit_minutes = nullif(p_task ->> 'time_limit_minutes', '')::int,
    period_year = coalesce(nullif(p_task ->> 'period_year', '')::smallint, period_year),
    period_month = coalesce(nullif(p_task ->> 'period_month', '')::smallint, period_month),
    period_week = coalesce(nullif(p_task ->> 'period_week', '')::smallint, period_week)
  where id = p_task_id
  returning kind into v_kind;

  if p_questions is not null and v_kind = 'test' then
    if exists (select 1 from public.test_attempts where task_id = p_task_id) then
      raise exception 'KOM_TEST_HAS_ATTEMPTS';
    end if;
    delete from public.test_questions where task_id = p_task_id;
    perform public.insert_test_questions(p_task_id, p_questions);
  end if;

  if p_add_students is not null then
    foreach v_sid in array p_add_students loop
      perform public.assign_task_student(p_task_id, v_sid);
    end loop;
  end if;
end $$;

-- ---------- Организатор архиві: өшірілген тапсырмалар тарихы ----------
create or replace function public.deleted_tasks_archive(p_limit int default 100)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_organizer() then raise exception 'KOM_FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(x order by x.last_deleted desc)
    from (
      select t.id, t.title, t.kind, t.priority, t.start_date, t.due_date, t.created_at,
             t.period_year, t.period_month, t.period_week, t.deleted_at,
             cp.full_name as curator_name,
             dp.full_name as deleted_by_name,
             max(s.deleted_at) as last_deleted,
             (t.deleted_at is not null) as fully_deleted,
             jsonb_agg(jsonb_build_object(
               'submission_id', s.id, 'student_name', sp.full_name, 'status', s.status,
               'submitted_at', s.submitted_at, 'reviewed_at', s.reviewed_at, 'deleted_at', s.deleted_at,
               'deleted_by_name', sdp.full_name,
               'score', a.score, 'max_score', a.max_score, 'started_at', a.started_at, 'finished_at', a.finished_at
             ) order by sp.full_name) as students
      from public.tasks t
      join public.task_submissions s on s.task_id = t.id and s.deleted_at is not null
      left join public.profiles cp on cp.id = t.curator_id
      left join public.profiles dp on dp.id = t.deleted_by
      left join public.profiles sp on sp.id = s.student_id
      left join public.profiles sdp on sdp.id = s.deleted_by
      left join public.test_attempts a on a.submission_id = s.id
      group by t.id, cp.full_name, dp.full_name
      order by max(s.deleted_at) desc
      limit greatest(1, least(p_limit, 500))
    ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.deleted_tasks_archive(int) from public, anon;
grant execute on function public.deleted_tasks_archive(int) to authenticated;

