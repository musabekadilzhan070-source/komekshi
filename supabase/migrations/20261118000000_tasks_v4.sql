-- =====================================================================
-- KÓMEKSHI v4
--  * Тестті кез келген уақытта өзгерту: нұсқалар (test_version), бұрынғы нәтижелер жоғалмайды
--  * Тест әрекеттерінің тарихы (қайта тапсыру, жаңа нұсқа)
--  * Тапсырма түрін өзгерту (оқушылар әлі бастамаған болса), оқушыларды алып тастау
--  * Жоспарға қосымша ескертпе
-- =====================================================================

-- ---------- Тест нұсқалары ----------
alter table public.tasks add column test_version int not null default 1 check (test_version >= 1);
alter table public.test_questions add column version int not null default 1 check (version >= 1);
alter table public.test_attempts add column test_version int not null default 1 check (test_version >= 1);
drop index if exists public.test_questions_task_idx;
create index test_questions_task_idx on public.test_questions (task_id, version, sort_order);

-- Оқушы клиент арқылы tasks.test_version-ді өзгерте алмайды
create or replace function public.guard_task_version() returns trigger
language plpgsql as $$
begin
  if public.is_client() and new.test_version <> old.test_version then raise exception 'KOM_FORBIDDEN'; end if;
  return new;
end $$;
create trigger guard_task_version before update on public.tasks
  for each row execute function public.guard_task_version();

-- Ағымдағы нұсқа сұрақтары ғана тікелей оқылады (куратор/организатор); бұрынғы нұсқалар тек нәтижелер арқылы
drop policy if exists questions_select on public.test_questions;
create policy questions_select on public.test_questions for select to authenticated using (
  (public.owns_task(task_id) or public.is_organizer())
);
drop policy if exists questions_update on public.test_questions;
drop policy if exists questions_insert on public.test_questions;
drop policy if exists questions_delete on public.test_questions;
-- Сұрақтар тек RPC арқылы жазылады
revoke insert, update, delete on public.test_questions from authenticated;

-- ---------- Тест әрекеттерінің тарихы ----------
create table public.test_attempt_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.task_submissions (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  test_version int not null,
  attempt_no int not null,
  started_at timestamptz,
  finished_at timestamptz,
  score numeric(8, 2),
  max_score numeric(8, 2),
  late boolean not null default false,
  result jsonb,
  reason text not null check (reason in ('retake', 'new_version')),
  archived_at timestamptz not null default now()
);
create index test_attempt_history_sub_idx on public.test_attempt_history (submission_id, archived_at desc);
create index test_attempt_history_task_idx on public.test_attempt_history (task_id);
alter table public.test_attempt_history enable row level security;
revoke all on public.test_attempt_history from anon;
revoke insert, update, delete on public.test_attempt_history from authenticated;
create policy attempt_history_select on public.test_attempt_history for select to authenticated using (
  public.can_view_student(student_id)
  and exists (select 1 from public.task_submissions s where s.id = submission_id and s.deleted_at is null)
);
alter publication supabase_realtime add table public.test_attempt_history;

-- Бір әрекеттің толық нәтижесі (сол әрекеттің нұсқасындағы сұрақтармен)
create or replace function public.attempt_result_json(p_att public.test_attempts) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_items jsonb;
begin
  if p_att.finished_at is null then
    return jsonb_build_object('attempt_no', p_att.attempt_no, 'started_at', p_att.started_at, 'finished_at', null,
                              'test_version', p_att.test_version);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'qtype', q.qtype, 'prompt', q.prompt, 'context_text', q.context_text, 'image_path', q.image_path,
      'options', q.options, 'answer', q.answer, 'explanation', q.explanation, 'points', q.points,
      'given', p_att.answers -> (q.id::text),
      'earned', public.grade_answer(q.qtype, q.answer, p_att.answers -> (q.id::text), q.points)
    ) order by q.sort_order), '[]'::jsonb)
    into v_items from public.test_questions q where q.task_id = p_att.task_id and q.version = p_att.test_version;
  return jsonb_build_object(
    'attempt_no', p_att.attempt_no, 'started_at', p_att.started_at, 'finished_at', p_att.finished_at,
    'duration_seconds', extract(epoch from (p_att.finished_at - p_att.started_at))::int,
    'late', p_att.late, 'score', p_att.score, 'max_score', p_att.max_score, 'items', v_items,
    'test_version', p_att.test_version
  );
end $$;
revoke all on function public.attempt_result_json(public.test_attempts) from public, anon, authenticated;

-- Әрекетті тарихқа көшіру (тек аяқталған әрекеттер)
create or replace function public.archive_attempt(p_att public.test_attempts, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_att.finished_at is null then return; end if;
  insert into public.test_attempt_history (submission_id, task_id, student_id, test_version, attempt_no, started_at,
                                           finished_at, score, max_score, late, result, reason)
  values (p_att.submission_id, p_att.task_id, p_att.student_id, p_att.test_version, p_att.attempt_no, p_att.started_at,
          p_att.finished_at, p_att.score, p_att.max_score, p_att.late, public.attempt_result_json(p_att), p_reason);
end $$;
revoke all on function public.archive_attempt(public.test_attempts, text) from public, anon, authenticated;

-- ---------- Тест тапсыру: нұсқаны ескереді ----------
create or replace function public.start_test(p_submission uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sub public.task_submissions; v_task public.tasks; v_att public.test_attempts; v_qs jsonb;
begin
  select * into v_sub from public.task_submissions where id = p_submission and deleted_at is null;
  if not found or not public.is_self_student(v_sub.student_id) then raise exception 'KOM_FORBIDDEN'; end if;
  select * into v_task from public.tasks where id = v_sub.task_id and deleted_at is null;
  if not found then raise exception 'KOM_TASK_DELETED'; end if;
  if v_task.kind <> 'test' then raise exception 'KOM_NOT_A_TEST'; end if;
  if v_sub.status = 'accepted' then raise exception 'KOM_TASK_ALREADY_ACCEPTED'; end if;

  select * into v_att from public.test_attempts where submission_id = p_submission for update;
  if found then
    if v_att.finished_at is not null then
      if v_sub.status <> 'needs_revision' then raise exception 'KOM_TEST_DONE'; end if;
      -- Алдыңғы нәтиже тарихта сақталады
      perform public.archive_attempt(v_att, 'retake');
      update public.test_attempts
        set started_at = now(), finished_at = null, answers = null, score = null, max_score = null,
            late = false, attempt_no = attempt_no + 1, test_version = v_task.test_version
        where id = v_att.id returning * into v_att;
    elsif v_att.test_version <> v_task.test_version then
      update public.test_attempts set started_at = now(), answers = null, test_version = v_task.test_version
        where id = v_att.id returning * into v_att;
    end if;
  else
    insert into public.test_attempts (submission_id, task_id, student_id, test_version)
    values (p_submission, v_task.id, v_sub.student_id, v_task.test_version) returning * into v_att;
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
    from public.test_questions tq where tq.task_id = v_task.id and tq.version = v_att.test_version
  ) q;

  return jsonb_build_object(
    'attempt_no', v_att.attempt_no,
    'started_at', v_att.started_at,
    'server_now', now(),
    'time_limit_minutes', v_task.time_limit_minutes,
    'questions', v_qs
  );
end $$;

create or replace function public.test_result(p_submission uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sub public.task_submissions; v_att public.test_attempts;
begin
  select * into v_sub from public.task_submissions where id = p_submission;
  if not found or not public.can_view_student(v_sub.student_id) then raise exception 'KOM_FORBIDDEN'; end if;
  select * into v_att from public.test_attempts where submission_id = p_submission;
  if not found then return null; end if;
  return public.attempt_result_json(v_att);
end $$;

create or replace function public.submit_test(p_submission uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sub public.task_submissions; v_task public.tasks; v_att public.test_attempts;
        v_answers jsonb; v_score numeric; v_max numeric; v_late boolean;
begin
  select * into v_sub from public.task_submissions where id = p_submission and deleted_at is null;
  if not found or not public.is_self_student(v_sub.student_id) then raise exception 'KOM_FORBIDDEN'; end if;
  select * into v_task from public.tasks where id = v_sub.task_id and deleted_at is null;
  if not found then raise exception 'KOM_TASK_DELETED'; end if;
  if v_task.kind <> 'test' then raise exception 'KOM_NOT_A_TEST'; end if;
  select * into v_att from public.test_attempts where submission_id = p_submission for update;
  if not found then raise exception 'KOM_TEST_NOT_STARTED'; end if;
  if v_att.finished_at is not null then raise exception 'KOM_TEST_DONE'; end if;
  -- Тапсыру кезінде куратор тестті жаңартса — оқушы жаңа нұсқаны қайта бастауы керек
  if v_att.test_version <> v_task.test_version then raise exception 'KOM_TEST_UPDATED'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 200000 then
    p_answers := '{}'::jsonb;
  end if;

  select coalesce(jsonb_object_agg(q.id::text, p_answers -> (q.id::text)) filter (where p_answers ? (q.id::text)), '{}'::jsonb),
         coalesce(sum(public.grade_answer(q.qtype, q.answer, p_answers -> (q.id::text), q.points)), 0),
         coalesce(sum(q.points), 0)
    into v_answers, v_score, v_max
    from public.test_questions q where q.task_id = v_task.id and q.version = v_att.test_version;

  v_late := v_task.time_limit_minutes is not null
            and now() > v_att.started_at + make_interval(mins => v_task.time_limit_minutes) + interval '60 seconds';

  update public.test_attempts
    set finished_at = now(), answers = v_answers, score = v_score, max_score = v_max, late = v_late
    where id = v_att.id;
  update public.task_submissions set status = 'pending_review', submitted_at = now() where id = p_submission;
  perform public.log_activity('test_submitted', 'task_submission', p_submission,
    jsonb_build_object('score', v_score, 'max', v_max, 'late', v_late, 'version', v_att.test_version));
  return public.test_result(p_submission);
end $$;

-- ---------- Сұрақтарды енгізу: нұсқа нөмірімен ----------
drop function if exists public.insert_test_questions(uuid, jsonb);
create or replace function public.insert_test_questions(p_task uuid, p_questions jsonb, p_version int default 1) returns void
language plpgsql security definer set search_path = public as $$
declare v_q jsonb; v_i int := 0;
begin
  if not public.owns_task(p_task) then raise exception 'KOM_FORBIDDEN'; end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'KOM_TEST_EMPTY';
  end if;
  if jsonb_array_length(p_questions) > 200 then raise exception 'KOM_TEST_INVALID'; end if;
  for v_q in select * from jsonb_array_elements(p_questions) loop
    v_i := v_i + 1;
    insert into public.test_questions (task_id, version, sort_order, qtype, prompt, context_text, image_path, options, answer, explanation, points)
    values (p_task, p_version, v_i, (v_q ->> 'qtype')::public.question_type, coalesce(v_q ->> 'prompt', ''),
            nullif(v_q ->> 'context_text', ''), nullif(v_q ->> 'image_path', ''),
            coalesce(v_q -> 'options', 'null'::jsonb), coalesce(v_q -> 'answer', 'null'::jsonb),
            nullif(v_q ->> 'explanation', ''), coalesce(nullif(v_q ->> 'points', '')::numeric, 1));
  end loop;
end $$;
revoke all on function public.insert_test_questions(uuid, jsonb, int) from public, anon;
grant execute on function public.insert_test_questions(uuid, jsonb, int) to authenticated;

-- ---------- Тапсырманы толық өзгерту ----------
drop function if exists public.update_task_v2(uuid, jsonb, jsonb, uuid[]);
create or replace function public.update_task_v2(
  p_task_id uuid, p_task jsonb, p_questions jsonb default null, p_add_students uuid[] default null,
  p_remove_students uuid[] default null, p_retake boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old public.tasks; v_kind public.task_kind; v_sid uuid; v_ver int; v_sub uuid; r record; v_att public.test_attempts;
  v_new_version boolean := false; v_retaken int := 0; v_changed text;
begin
  if not public.owns_task(p_task_id) then raise exception 'KOM_FORBIDDEN'; end if;
  select * into v_old from public.tasks where id = p_task_id and deleted_at is null for update;
  if not found then raise exception 'KOM_TASK_DELETED'; end if;
  v_kind := coalesce(nullif(p_task ->> 'kind', ''), v_old.kind::text)::public.task_kind;

  -- Түрін өзгерту: тек ешбір оқушы бастамаған болса
  if v_kind <> v_old.kind then
    if exists (select 1 from public.task_submissions s where s.task_id = p_task_id and s.deleted_at is null
               and (s.status <> 'new' or s.answer_text is not null or s.answer_data is not null))
       or exists (select 1 from public.test_attempts where task_id = p_task_id)
       or exists (select 1 from public.submission_files f join public.task_submissions s on s.id = f.submission_id
                  where s.task_id = p_task_id) then
      raise exception 'KOM_TASK_KIND_LOCKED';
    end if;
    if v_kind = 'test' and p_questions is null then raise exception 'KOM_TEST_EMPTY'; end if;
  end if;

  update public.tasks set
    title = btrim(coalesce(p_task ->> 'title', title)),
    description = nullif(btrim(coalesce(p_task ->> 'description', '')), ''),
    instructions = nullif(btrim(coalesce(p_task ->> 'instructions', '')), ''),
    start_date = coalesce(nullif(p_task ->> 'start_date', '')::date, start_date),
    due_date = coalesce(nullif(p_task ->> 'due_date', '')::date, due_date),
    priority = coalesce(nullif(p_task ->> 'priority', ''), priority::text)::public.priority_level,
    kind = v_kind,
    external_url = nullif(btrim(coalesce(p_task ->> 'external_url', '')), ''),
    config = coalesce(p_task -> 'config', config),
    time_limit_minutes = nullif(p_task ->> 'time_limit_minutes', '')::int,
    period_year = coalesce(nullif(p_task ->> 'period_year', '')::smallint, period_year),
    period_month = coalesce(nullif(p_task ->> 'period_month', '')::smallint, period_month),
    period_week = coalesce(nullif(p_task ->> 'period_week', '')::smallint, period_week)
  where id = p_task_id;

  if v_old.kind = 'test' and v_kind <> 'test' then
    delete from public.test_questions where task_id = p_task_id;
  end if;

  if v_kind = 'test' and p_questions is not null then
    if exists (select 1 from public.test_attempts where task_id = p_task_id) then
      -- Тест басталған: жаңа нұсқа жасаймыз, бұрынғы сұрақтар мен нәтижелер сақталады
      v_ver := v_old.test_version + 1;
      v_new_version := true;
      update public.tasks set test_version = v_ver where id = p_task_id;
      perform public.insert_test_questions(p_task_id, p_questions, v_ver);
      -- Аяқталмаған әрекеттер жаңа нұсқадан қайта басталады
      update public.test_attempts set test_version = v_ver, started_at = now(), answers = null
        where task_id = p_task_id and finished_at is null;
      if p_retake then
        for v_att in select a.* from public.test_attempts a
                 join public.task_submissions s on s.id = a.submission_id and s.deleted_at is null
                 where a.task_id = p_task_id and a.finished_at is not null loop
          perform public.archive_attempt(v_att, 'new_version');
          delete from public.test_attempts where id = v_att.id;
          update public.task_submissions set status = 'new', submitted_at = null, reviewed_at = null
            where id = v_att.submission_id;
          v_retaken := v_retaken + 1;
        end loop;
      end if;
    else
      delete from public.test_questions where task_id = p_task_id;
      perform public.insert_test_questions(p_task_id, p_questions, v_old.test_version);
    end if;
  end if;

  if p_remove_students is not null then
    foreach v_sid in array p_remove_students loop
      select id into v_sub from public.task_submissions where task_id = p_task_id and student_id = v_sid and deleted_at is null;
      if v_sub is not null then perform public.delete_task_assignment(v_sub); end if;
    end loop;
  end if;

  if p_add_students is not null then
    foreach v_sid in array p_add_students loop
      perform public.assign_task_student(p_task_id, v_sid);
    end loop;
  end if;

  -- Оқушыларға хабарлама — кабинет бірден жаңарады
  v_changed := btrim(coalesce(p_task ->> 'title', v_old.title));
  for r in select s.student_id from public.task_submissions s
           where s.task_id = p_task_id and s.deleted_at is null
             and (p_add_students is null or not (s.student_id = any (p_add_students))) loop
    perform public.notify(r.student_id, 'task_updated',
      case when v_new_version and p_retake then 'Тест жаңартылды — қайта тапсырыңыз' else 'Тапсырма жаңартылды' end,
      v_changed, '/student/tasks', p_task_id);
  end loop;
  perform public.log_activity('task.updated', 'task', p_task_id,
    jsonb_build_object('new_version', v_new_version, 'retake', v_retaken, 'kind', v_kind));
  return jsonb_build_object('new_version', v_new_version, 'retaken', v_retaken,
                            'test_version', (select test_version from public.tasks where id = p_task_id));
end $$;
revoke all on function public.update_task_v2(uuid, jsonb, jsonb, uuid[], uuid[], boolean) from public, anon;
grant execute on function public.update_task_v2(uuid, jsonb, jsonb, uuid[], uuid[], boolean) to authenticated;

-- create_task_v2 security invoker болып қалады, бірақ сұрақтар енді definer функциясы арқылы жазылады
-- (insert_test_questions owns_task тексереді — тапсырма жаңа ғана жасалғандықтан куратор иесі)

-- ---------- Тапсырманы көшіру үшін: ағымдағы нұсқаның сұрақтары ----------
-- (куратор test_questions-ты RLS арқылы оқиды; клиент version = tasks.test_version бойынша сүзеді)

-- ---------- Жоспарға қосымша ескертпе ----------
alter table public.plans add column note text check (note is null or char_length(note) <= 2000);

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
         or new.note is distinct from old.note
         or new.plan_date <> old.plan_date or new.start_time is distinct from old.start_time
         or new.end_time is distinct from old.end_time or new.priority <> old.priority then
        raise exception 'KOM_CURATOR_PLAN_LOCKED';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
