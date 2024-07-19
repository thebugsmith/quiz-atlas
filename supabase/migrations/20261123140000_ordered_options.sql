-- Options are presented in the order the question was written.
--
-- Shuffling broke every question whose options refer to each other ("None of the
-- above", "Both A and B", "Only 1 and 3"), so the stored option order is now the
-- authored order. Question selection is still seeded and frozen per attempt.

create or replace function public.game_create_classic_attempt(
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
           -- Authored order, not shuffled: options such as "None of the above" or
           -- "Both A and B" only make sense where the author placed them.
           select jsonb_agg((option ->> 'id')::integer order by (option ->> 'id')::integer)
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

