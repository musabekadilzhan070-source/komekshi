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
