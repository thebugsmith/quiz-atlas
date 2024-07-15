-- Game mutations for the Classic flow.
--
-- Everything here runs inside one transaction per call and is callable only by the
-- server: EXECUTE is revoked from PUBLIC, anon and authenticated, and granted to
-- service_role. Each function re-checks the supplied owner against the attempt
-- row, because the server key bypasses RLS.

alter table public.attempts
  add column create_key text,
  add constraint attempts_create_key_len check (create_key is null or char_length(create_key) between 8 and 100);

-- A retried create returns the same attempt instead of a second one.
create unique index attempts_owner_create_key_idx
  on public.attempts (owner_id, create_key)
  where create_key is not null;

create function public.game_create_classic_attempt(
  p_attempt_id uuid,
  p_owner uuid,
  p_seed text,
  p_topics text[],
  p_difficulty text,
  p_count integer,
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
begin
  if p_count < 1 or p_count > 50 then
    raise exception 'invalid_count' using errcode = '22023';
  end if;

  -- Same create key twice (double click, retried request): return the first attempt.
  select * into v_existing
    from public.attempts
   where owner_id = p_owner and create_key = p_create_key;

  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id,
      'status', v_existing.status,
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

  if v_available < p_count then
    raise exception 'insufficient_inventory:%', v_available using errcode = 'P0002';
  end if;

  insert into public.attempts (id, owner_id, mode, status, config, rules_version,
                               selection_seed, question_count, create_key)
  values (
    p_attempt_id, p_owner, 'classic', 'ready',
    jsonb_build_object('topics', p_topics, 'difficulty', p_difficulty, 'count', p_count),
    1, p_seed, p_count, p_create_key
  )
  returning * into v_attempt;

  -- Deterministic selection: the seed decides which questions and which option
  -- order, so a retried create reproduces the same quiz and refreshes cannot change it.
  insert into public.attempt_questions (attempt_id, position, question_id, question_version_id, option_order)
  select v_attempt.id, row_number() over (order by md5(v_attempt.selection_seed || q.id::text)),
         q.id, v.id,
         (
           select jsonb_agg((option ->> 'id')::integer order by md5(v_attempt.selection_seed || q.id::text || (option ->> 'id')))
             from jsonb_array_elements(v.options) as option
         )
    from content.questions q
    join content.question_versions v on v.id = q.current_version_id
    join content.topics t on t.id = v.topic_id
   where q.archived_at is null
     and t.is_active
     and t.slug = any (p_topics)
     and (p_difficulty = 'mixed' or v.difficulty::text = p_difficulty)
   order by md5(v_attempt.selection_seed || q.id::text)
   limit p_count;

  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'question_count', v_created,
    'reused', false
  );
end;
$$;

create function public.game_start_attempt(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_attempt.status = 'ready' then
    update public.attempts
       set status = 'active', started_at = now(), current_position = 0
     where id = p_attempt_id
     returning * into v_attempt;
  elsif v_attempt.status <> 'active' then
    raise exception 'attempt_not_startable:%', v_attempt.status using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'started_at', v_attempt.started_at,
    'question_count', v_attempt.question_count,
    'current_position', v_attempt.current_position
  );
end;
$$;

-- Safe question payload: no correct option, no explanation, options in the stored order.
create function public.game_current_question(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
  v_result jsonb;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
           'position', aq.position,
           'total', v_attempt.question_count,
           'question_version_id', aq.question_version_id,
           'type', v.question_type,
           'stem', v.stem,
           'statements', to_jsonb(v.statements),
           'prompt', v.prompt,
           'options', (
             select jsonb_agg(
                      jsonb_build_object('id', (option ->> 'id')::integer, 'text', option ->> 'text')
                      order by array_position(
                        array(select jsonb_array_elements_text(aq.option_order)),
                        option ->> 'id'
                      )
                    )
               from jsonb_array_elements(v.options) as option
           ),
           'answered', exists (select 1 from public.attempt_answers aa where aa.attempt_question_id = aq.id)
         )
    into v_result
    from public.attempt_questions aq
    join content.question_versions v on v.id = aq.question_version_id
   where aq.attempt_id = v_attempt.id
     and aq.position = v_attempt.current_position + 1;

  if v_result is null then
    return jsonb_build_object('position', null, 'total', v_attempt.question_count, 'finished', true);
  end if;

  return v_result;
end;
$$;

create function public.game_submit_answer(
  p_attempt_id uuid,
  p_owner uuid,
  p_position integer,
  p_option_id integer,
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
  v_is_correct boolean;
  v_points integer;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'active' then
    raise exception 'attempt_not_active:%', v_attempt.status using errcode = 'P0001';
  end if;
  if p_position <> v_attempt.current_position + 1 then
    raise exception 'stale_position:%', v_attempt.current_position + 1 using errcode = 'P0001';
  end if;

  select * into v_question
    from public.attempt_questions
   where attempt_id = v_attempt.id and position = p_position;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_existing
    from public.attempt_answers
   where attempt_question_id = v_question.id;

  if found then
    -- An identical retry returns the stored outcome; anything else is a conflict.
    if v_existing.idempotency_key = p_idempotency_key then
      select * into v_version from content.question_versions where id = v_question.question_version_id;
      return jsonb_build_object(
        'accepted', true,
        'replayed', true,
        'position', p_position,
        'is_correct', v_existing.is_correct,
        'points', v_existing.points_awarded,
        'correct_option_id', v_version.correct_option_id,
        'explanation', v_version.explanation,
        'score', v_attempt.score
      );
    end if;
    raise exception 'already_answered' using errcode = 'P0001';
  end if;

  select * into v_version from content.question_versions where id = v_question.question_version_id;

  if not exists (
    select 1 from jsonb_array_elements(v_version.options) as option
     where (option ->> 'id')::integer = p_option_id
  ) then
    raise exception 'invalid_option' using errcode = '22023';
  end if;

  v_is_correct := v_version.correct_option_id = p_option_id;
  v_points := case when v_is_correct then 100 else 0 end;

  insert into public.attempt_answers
    (attempt_id, attempt_question_id, action, selected_option_id, is_correct, points_awarded, idempotency_key)
  values
    (v_attempt.id, v_question.id, 'answer', p_option_id::text, v_is_correct, v_points, p_idempotency_key);

  update public.attempts
     set score = score + v_points,
         correct_count = correct_count + case when v_is_correct then 1 else 0 end,
         wrong_count = wrong_count + case when v_is_correct then 0 else 1 end
   where id = v_attempt.id
   returning * into v_attempt;

  return jsonb_build_object(
    'accepted', true,
    'replayed', false,
    'position', p_position,
    'is_correct', v_is_correct,
    'points', v_points,
    'correct_option_id', v_version.correct_option_id,
    'explanation', v_version.explanation,
    'score', v_attempt.score
  );
end;
$$;

create function public.game_advance(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'active' then
    raise exception 'attempt_not_active:%', v_attempt.status using errcode = 'P0001';
  end if;

  -- Advancing is only legitimate after the current question was answered.
  if not exists (
    select 1
      from public.attempt_questions aq
      join public.attempt_answers aa on aa.attempt_question_id = aq.id
     where aq.attempt_id = v_attempt.id
       and aq.position = v_attempt.current_position + 1
  ) then
    raise exception 'not_ready_to_advance' using errcode = 'P0001';
  end if;

  if v_attempt.current_position + 1 >= v_attempt.question_count then
    update public.attempts
       set status = 'completed', finished_at = now(), current_position = question_count
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
    'score', v_attempt.score
  );
end;
$$;

create function public.game_finish(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
  v_answered integer;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_attempt.status in ('completed', 'expired', 'abandoned') then
    return jsonb_build_object(
      'status', v_attempt.status, 'score', v_attempt.score,
      'question_count', v_attempt.question_count, 'replayed', true
    );
  end if;

  select count(*) into v_answered
    from public.attempt_questions aq
    join public.attempt_answers aa on aa.attempt_question_id = aq.id
   where aq.attempt_id = v_attempt.id;

  update public.attempts
     set status = (case when v_answered >= question_count then 'completed' else 'abandoned' end)::public.attempt_status,
         finished_at = now()
   where id = v_attempt.id
   returning * into v_attempt;

  return jsonb_build_object(
    'status', v_attempt.status, 'score', v_attempt.score,
    'question_count', v_attempt.question_count, 'answered', v_answered, 'replayed', false
  );
end;
$$;

-- Privileges: server only. The browser roles never see these functions.
revoke all on function public.game_create_classic_attempt(uuid, uuid, text, text[], text, integer, text) from public;
revoke all on function public.game_start_attempt(uuid, uuid) from public;
revoke all on function public.game_current_question(uuid, uuid) from public;
revoke all on function public.game_submit_answer(uuid, uuid, integer, integer, text) from public;
revoke all on function public.game_advance(uuid, uuid) from public;
revoke all on function public.game_finish(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_create_classic_attempt(uuid, uuid, text, text[], text, integer, text) to service_role;
    grant execute on function public.game_start_attempt(uuid, uuid) to service_role;
    grant execute on function public.game_current_question(uuid, uuid) to service_role;
    grant execute on function public.game_submit_answer(uuid, uuid, integer, integer, text) to service_role;
    grant execute on function public.game_advance(uuid, uuid) to service_role;
    grant execute on function public.game_finish(uuid, uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_create_classic_attempt(uuid, uuid, text, text[], text, integer, text) from anon;
    revoke all on function public.game_start_attempt(uuid, uuid) from anon;
    revoke all on function public.game_current_question(uuid, uuid) from anon;
    revoke all on function public.game_submit_answer(uuid, uuid, integer, integer, text) from anon;
    revoke all on function public.game_advance(uuid, uuid) from anon;
    revoke all on function public.game_finish(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_create_classic_attempt(uuid, uuid, text, text[], text, integer, text) from authenticated;
    revoke all on function public.game_start_attempt(uuid, uuid) from authenticated;
    revoke all on function public.game_current_question(uuid, uuid) from authenticated;
    revoke all on function public.game_submit_answer(uuid, uuid, integer, integer, text) from authenticated;
    revoke all on function public.game_advance(uuid, uuid) from authenticated;
    revoke all on function public.game_finish(uuid, uuid) from authenticated;
  end if;
end
$$;
