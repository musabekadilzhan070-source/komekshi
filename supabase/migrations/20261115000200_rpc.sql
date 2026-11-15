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
