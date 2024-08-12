-- Survival: three lives, one lost per wrong answer or skip.
--
-- Lives are decremented inside the same function that records the answer, under the
-- attempt row lock that `game_submit_answer` already takes. A retried submission with
-- the same idempotency key returns `replayed: true` and therefore costs nothing, so
-- concurrent or duplicated requests cannot drain a life twice.

create or replace function public.game_create_survival_attempt(
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
security definer
set search_path = public, pg_temp
as $$
declare
  v_available integer;
  v_created integer;
  v_existing public.attempts%rowtype;
  v_attempt public.attempts%rowtype;
  v_count integer := greatest(1, least(coalesce(p_count, 50), 100));
begin
  select * into v_existing
    from public.attempts
   where owner_id = p_owner and create_key = p_create_key;
  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id, 'status', v_existing.status, 'mode', 'survival',
      'question_count', v_existing.question_count, 'reused', true
    );
  end if;

  select count(*) into v_available
    from content.questions q
    join content.question_versions v on v.id = q.current_version_id
    join content.topics t on t.id = v.topic_id
   where q.archived_at is null
     and q.quarantined_at is null
     and t.is_active
     and t.slug = any (p_topics)
     and (p_difficulty = 'mixed' or v.difficulty::text = p_difficulty);

  if v_available = 0 then
    raise exception 'insufficient_inventory:%', v_available using errcode = 'P0002';
  end if;

  insert into public.attempts (id, owner_id, mode, status, config, rules_version,
                               selection_seed, question_count, lives, create_key)
  values (
    p_attempt_id, p_owner, 'survival', 'ready',
    jsonb_build_object(
      'topics', p_topics, 'difficulty', p_difficulty, 'count', least(v_count, v_available),
      'lives', 3, 'ranked', false
    ),
    1, p_seed, least(v_count, v_available), 3, p_create_key
  )
  returning * into v_attempt;

  insert into public.attempt_questions (attempt_id, position, question_id, question_version_id, option_order)
  select v_attempt.id,
         row_number() over (order by md5(v_attempt.selection_seed || q.id::text)),
         q.id, v.id,
         (select jsonb_agg((option ->> 'id')::integer order by (option ->> 'id')::integer)
            from jsonb_array_elements(v.options) as option)
    from content.questions q
    join content.question_versions v on v.id = q.current_version_id
    join content.topics t on t.id = v.topic_id
   where q.archived_at is null
     and q.quarantined_at is null
     and t.is_active
     and t.slug = any (p_topics)
     and (p_difficulty = 'mixed' or v.difficulty::text = p_difficulty)
   order by md5(v_attempt.selection_seed || q.id::text)
   limit least(v_count, v_available);

  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'attempt_id', v_attempt.id, 'status', v_attempt.status, 'mode', 'survival',
    'question_count', v_created, 'lives', 3, 'reused', false
  );
end;
$$;

revoke all on function public.game_create_survival_attempt(uuid, uuid, text, text[], text, integer, text) from public;

/**
 * Records the answer through the shared engine, then charges a life when the outcome
 * deserves one. The attempt row is already locked by the inner call, so the read-modify
 * write here cannot race with another submission.
 */
create or replace function public.game_submit_survival_answer(
  p_attempt_id uuid,
  p_owner uuid,
  p_position integer,
  p_option_id integer,
  p_action text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_attempt public.attempts%rowtype;
  v_lost boolean := false;
  v_finished boolean := false;
begin
  v_result := public.game_submit_answer(
    p_attempt_id, p_owner, p_position, p_option_id, p_action, p_idempotency_key
  );

  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if coalesce((v_result ->> 'accepted')::boolean, false)
     and not coalesce((v_result ->> 'replayed')::boolean, false) then
    v_lost := p_action = 'skip' or not coalesce((v_result ->> 'is_correct')::boolean, false);

    if v_lost then
      update public.attempts
         set lives = greatest(coalesce(lives, 3) - 1, 0)
       where id = v_attempt.id
       returning * into v_attempt;
    end if;

    if coalesce(v_attempt.lives, 0) <= 0 then
      update public.attempts
         set status = 'completed', finished_at = coalesce(finished_at, now())
       where id = v_attempt.id
       returning * into v_attempt;
      v_finished := true;
    elsif p_position >= v_attempt.question_count
          and v_attempt.status = 'active' then
      -- Pool exhausted: nothing left to ask, so the run ends normally.
      update public.attempts
         set status = 'completed', finished_at = coalesce(finished_at, now())
       where id = v_attempt.id
       returning * into v_attempt;
      v_finished := true;
    end if;
  end if;

  return v_result || jsonb_build_object(
    'lives_left', coalesce(v_attempt.lives, 0),
    'life_lost', v_lost,
    'finished', v_finished or v_attempt.status <> 'active'
  );
end;
$$;

revoke all on function public.game_submit_survival_answer(uuid, uuid, integer, integer, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_create_survival_attempt(uuid, uuid, text, text[], text, integer, text) to service_role;
    grant execute on function public.game_submit_survival_answer(uuid, uuid, integer, integer, text, text) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_create_survival_attempt(uuid, uuid, text, text[], text, integer, text) from anon;
    revoke all on function public.game_submit_survival_answer(uuid, uuid, integer, integer, text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_create_survival_attempt(uuid, uuid, text, text[], text, integer, text) from authenticated;
    revoke all on function public.game_submit_survival_answer(uuid, uuid, integer, integer, text, text) from authenticated;
  end if;
end
$$;
