-- Mix means "every topic": an empty topic list used to match nothing, so the picker's
-- "All topics" tile produced an empty pool and the start call failed.

CREATE OR REPLACE FUNCTION public.game_create_attempt(p_attempt_id uuid, p_owner uuid, p_seed text, p_mode text, p_topics text[], p_difficulty text, p_count integer, p_duration_seconds integer, p_create_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
         and q.quarantined_at is null
     and t.is_active
     and (coalesce(cardinality(p_topics), 0) = 0
           or t.slug = any (p_topics))
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
         and q.quarantined_at is null
         and t.is_active
         and (coalesce(cardinality(p_topics), 0) = 0
           or t.slug = any (p_topics))
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
$function$
;