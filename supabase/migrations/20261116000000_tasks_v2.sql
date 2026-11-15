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
