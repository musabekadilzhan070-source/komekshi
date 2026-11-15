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
