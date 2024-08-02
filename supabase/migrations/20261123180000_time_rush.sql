-- Time Rush: a server-owned deadline, a finite unique queue, and expiry that
-- finalizes the attempt without anybody having to be present.

-- Time Rush draws from a finite queue capped at 200 questions, so the stored count
-- may exceed Classic's 50-question ceiling.
alter table public.attempts drop constraint if exists attempts_question_count_check;
alter table public.attempts
  add constraint attempts_question_count_check check (question_count between 1 and 200);

-- One generic create function for the modes that start from a setup screen.
create or replace function public.game_create_attempt(
  p_attempt_id uuid,
  p_owner uuid,
  p_seed text,
  p_mode text,
  p_topics text[],
  p_difficulty text,
  p_count integer,
  p_duration_seconds integer,
  p_create_key text
)
returns jsonb
language plpgsql
as $$
declare
  v_available integer;
  v_created integer;
  v_existing public.attempts%rowtype;
  v_attempt public.attempts%rowtype;
  v_mode public.attempt_mode;
  v_count integer;
begin
  if p_mode not in ('classic', 'time_rush') then
    raise exception 'unsupported_mode' using errcode = '22023';
  end if;
  v_mode := p_mode::public.attempt_mode;

  if v_mode = 'classic' and (p_count < 1 or p_count > 50) then
    raise exception 'invalid_count' using errcode = '22023';
  end if;
  if v_mode = 'time_rush' and (p_duration_seconds is null or p_duration_seconds not in (30, 60, 120)) then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;

  select * into v_existing
    from public.attempts
   where owner_id = p_owner and create_key = p_create_key;

  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id,
      'status', v_existing.status,
      'mode', v_existing.mode,
      'question_count', v_existing.question_count,
      'reused', true
    );
  end if;

  select count(*) into v_available
    from content.questions q
    join content.question_versions v on v.id = q.current_version_id
    join content.topics t on t.id = v.topic_id
   where q.archived_at is null
     and t.is_active
     and t.slug = any (p_topics)
     and (p_difficulty = 'mixed' or v.difficulty::text = p_difficulty);

  -- Time Rush players answer until the clock or the queue runs out, so the only
  -- requirement is a non-empty pool, capped at the 200-question queue limit.
  if v_mode = 'time_rush' then
    if v_available = 0 then
      raise exception 'insufficient_inventory:%', v_available using errcode = 'P0002';
    end if;
    v_count := least(v_available, 200);
  else
    v_count := p_count;
    if v_available < v_count then
      raise exception 'insufficient_inventory:%', v_available using errcode = 'P0002';
    end if;
  end if;

  insert into public.attempts (id, owner_id, mode, status, config, rules_version,
                               selection_seed, question_count, create_key)
  values (
    p_attempt_id, p_owner, v_mode, 'ready',
    jsonb_build_object(
      'topics', p_topics,
      'difficulty', p_difficulty,
      'count', v_count,
      'durationSeconds', p_duration_seconds
    ),
    1, p_seed, v_count, p_create_key
  )
  returning * into v_attempt;

  insert into public.attempt_questions (attempt_id, position, question_id, question_version_id, option_order)
  select v_attempt.id,
         row_number() over (order by c.pick_rank, md5(v_attempt.selection_seed || c.id::text)),
         c.id, c.version_id,
         (
           select jsonb_agg((option ->> 'id')::integer order by (option ->> 'id')::integer)
             from jsonb_array_elements(c.options) as option
         )
    from (
      select q.id, v.id as version_id, v.options,
             row_number() over (
               partition by t.slug
               order by md5(v_attempt.selection_seed || q.id::text)
             ) as pick_rank
        from content.questions q
        join content.question_versions v on v.id = q.current_version_id
        join content.topics t on t.id = v.topic_id
       where q.archived_at is null
         and t.is_active
         and t.slug = any (p_topics)
         and (p_difficulty = 'mixed' or v.difficulty::text = p_difficulty)
    ) as c
   order by c.pick_rank, md5(v_attempt.selection_seed || c.id::text)
   limit v_count;

  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'mode', v_attempt.mode,
    'question_count', v_created,
    'reused', false
  );
end;
$$;

-- Starting activates the attempt and, for timed modes, fixes the deadline from the
-- database clock. The returned `server_now` lets the browser measure its offset.
create or replace function public.game_start_attempt(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
  v_duration integer;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_attempt.status = 'ready' then
    v_duration := coalesce((v_attempt.config ->> 'durationSeconds')::integer, 0);
    update public.attempts
       set status = 'active',
           started_at = now(),
           current_position = 0,
           expires_at = case when v_attempt.mode = 'time_rush'
                             then now() + make_interval(secs => v_duration)
                             else null end
     where id = p_attempt_id
     returning * into v_attempt;
  elsif v_attempt.status <> 'active' then
    raise exception 'attempt_not_startable:%', v_attempt.status using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'mode', v_attempt.mode,
    'started_at', v_attempt.started_at,
    'expires_at', v_attempt.expires_at,
    'question_count', v_attempt.question_count,
    'current_position', v_attempt.current_position,
    'server_now', now()
  );
end;
$$;

-- Answer acceptance: an identical retry is replayed even after the deadline; a new
-- answer is only accepted strictly before it.
create or replace function public.game_submit_answer(
  p_attempt_id uuid,
  p_owner uuid,
  p_position integer,
  p_option_id integer,
  p_action text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
  v_question public.attempt_questions%rowtype;
  v_version content.question_versions%rowtype;
  v_existing public.attempt_answers%rowtype;
  v_is_correct boolean := false;
  v_points integer := 0;
  v_action public.answer_action;
begin
  if p_action not in ('answer', 'skip') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  v_action := p_action::public.answer_action;

  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'active' then
    raise exception 'attempt_not_active:%', v_attempt.status using errcode = 'P0001';
  end if;

  select * into v_question
    from public.attempt_questions
   where attempt_id = v_attempt.id and position = v_attempt.current_position + 1;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_version from content.question_versions where id = v_question.question_version_id;

  select * into v_existing
    from public.attempt_answers
   where attempt_question_id = v_question.id;

  -- Replay first: an accepted answer stays accepted, even if its retry arrives late.
  if found then
    if v_existing.idempotency_key = p_idempotency_key then
      return jsonb_build_object(
        'accepted', true,
        'replayed', true,
        'action', v_existing.action,
        'position', v_question.position,
        'is_correct', v_existing.is_correct,
        'points', v_existing.points_awarded,
        'correct_option_id', v_version.correct_option_id,
        'explanation', v_version.explanation,
        'score', v_attempt.score
      );
    end if;
    raise exception 'already_answered' using errcode = 'P0001';
  end if;

  if v_attempt.expires_at is not null and now() >= v_attempt.expires_at then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;

  if p_position <> v_attempt.current_position + 1 then
    raise exception 'stale_position:%', v_attempt.current_position + 1 using errcode = 'P0001';
  end if;

  if v_action = 'answer' then
    if p_option_id is null or not exists (
      select 1 from jsonb_array_elements(v_version.options) as option
       where (option ->> 'id')::integer = p_option_id
    ) then
      raise exception 'invalid_option' using errcode = '22023';
    end if;
    v_is_correct := v_version.correct_option_id = p_option_id;
    v_points := case when v_is_correct then 100 else 0 end;
  end if;

  insert into public.attempt_answers
    (attempt_id, attempt_question_id, action, selected_option_id, is_correct, points_awarded, idempotency_key)
  values
    (v_attempt.id, v_question.id, v_action,
     case when v_action = 'answer' then p_option_id::text else null end,
     v_is_correct, v_points, p_idempotency_key);

  update public.attempts
     set score = score + v_points,
         correct_count = correct_count + case when v_is_correct then 1 else 0 end,
         wrong_count = wrong_count + case when v_action = 'answer' and not v_is_correct then 1 else 0 end,
         skipped_count = skipped_count + case when v_action = 'skip' then 1 else 0 end
   where id = v_attempt.id
   returning * into v_attempt;

  return jsonb_build_object(
    'accepted', true,
    'replayed', false,
    'action', v_action,
    'position', v_question.position,
    'is_correct', v_is_correct,
    'points', v_points,
    'correct_option_id', v_version.correct_option_id,
    'explanation', v_version.explanation,
    'score', v_attempt.score
  );
end;
$$;

-- Advance also closes a timed attempt at the deadline, and a queue that runs out.
create or replace function public.game_advance(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
  v_last_position integer;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'active' then
    raise exception 'attempt_not_active:%', v_attempt.status using errcode = 'P0001';
  end if;

  if not exists (
    select 1
      from public.attempt_questions aq
      join public.attempt_answers aa on aa.attempt_question_id = aq.id
     where aq.attempt_id = v_attempt.id
       and aq.position = v_attempt.current_position + 1
  ) then
    raise exception 'not_ready_to_advance' using errcode = 'P0001';
  end if;

  select max(position) into v_last_position
    from public.attempt_questions where attempt_id = v_attempt.id;

  if v_attempt.expires_at is not null and now() >= v_attempt.expires_at then
    update public.attempts
       set status = 'completed', finished_at = now()
     where id = v_attempt.id
     returning * into v_attempt;
  elsif v_attempt.current_position + 1 >= v_last_position then
    update public.attempts
       set status = 'completed', finished_at = now(), current_position = v_last_position
     where id = v_attempt.id
     returning * into v_attempt;
  else
    update public.attempts
       set current_position = current_position + 1
     where id = v_attempt.id
     returning * into v_attempt;
  end if;

  return jsonb_build_object(
    'status', v_attempt.status,
    'current_position', v_attempt.current_position,
    'question_count', v_attempt.question_count,
    'score', v_attempt.score,
    'expires_at', v_attempt.expires_at,
    'server_now', now()
  );
end;
$$;

-- Opening an attempt applies retention and closes a timed attempt whose deadline
-- has passed, so nobody has to be playing for the result to become final.
create or replace function public.game_expire_attempt(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
  v_last_activity timestamptz;
  v_status public.attempt_status;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_attempt.status = 'active' and v_attempt.expires_at is not null and now() >= v_attempt.expires_at then
    update public.attempts
       set status = 'completed', finished_at = now()
     where id = p_attempt_id
     returning status into v_status;
    return jsonb_build_object('status', v_status, 'expired', true, 'server_now', now());
  end if;

  if v_attempt.status = 'ready' and v_attempt.created_at < now() - interval '1 hour' then
    update public.attempts
       set status = 'expired', finished_at = now()
     where id = p_attempt_id
     returning status into v_status;
    return jsonb_build_object('status', v_status, 'expired', true, 'server_now', now());
  end if;

  if v_attempt.status = 'active' then
    select greatest(
             coalesce(v_attempt.started_at, v_attempt.created_at),
             coalesce((select max(aa.accepted_at)
                         from public.attempt_answers aa
                        where aa.attempt_id = v_attempt.id), v_attempt.created_at)
           )
      into v_last_activity;

    if v_last_activity < now() - interval '7 days' then
      update public.attempts
         set status = 'abandoned', finished_at = now()
       where id = p_attempt_id
       returning status into v_status;
      return jsonb_build_object('status', v_status, 'expired', true, 'server_now', now());
    end if;
  end if;

  return jsonb_build_object('status', v_attempt.status, 'expired', false, 'server_now', now());
end;
$$;

revoke all on function public.game_create_attempt(uuid, uuid, text, text, text[], text, integer, integer, text) from public;
revoke all on function public.game_start_attempt(uuid, uuid) from public;
revoke all on function public.game_submit_answer(uuid, uuid, integer, integer, text, text) from public;
revoke all on function public.game_advance(uuid, uuid) from public;
revoke all on function public.game_expire_attempt(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_create_attempt(uuid, uuid, text, text, text[], text, integer, integer, text) to service_role;
    grant execute on function public.game_start_attempt(uuid, uuid) to service_role;
    grant execute on function public.game_submit_answer(uuid, uuid, integer, integer, text, text) to service_role;
    grant execute on function public.game_advance(uuid, uuid) to service_role;
    grant execute on function public.game_expire_attempt(uuid, uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_create_attempt(uuid, uuid, text, text, text[], text, integer, integer, text) from anon;
    revoke all on function public.game_submit_answer(uuid, uuid, integer, integer, text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_create_attempt(uuid, uuid, text, text, text[], text, integer, integer, text) from authenticated;
    revoke all on function public.game_submit_answer(uuid, uuid, integer, integer, text, text) from authenticated;
  end if;
end
$$;
