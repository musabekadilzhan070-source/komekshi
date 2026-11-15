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
