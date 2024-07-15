-- Classic needs skipping as a first-class accepted action: zero points, counted
-- separately, and impossible to undo once accepted.
--
-- The function keeps its idempotency contract; only the payload and the counters
-- change, so the old signature is dropped first.

drop function if exists public.game_submit_answer(uuid, uuid, integer, integer, text);

create function public.game_submit_answer(
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
  if p_position <> v_attempt.current_position + 1 then
    raise exception 'stale_position:%', v_attempt.current_position + 1 using errcode = 'P0001';
  end if;

  select * into v_question
    from public.attempt_questions
   where attempt_id = v_attempt.id and position = p_position;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_version from content.question_versions where id = v_question.question_version_id;

  select * into v_existing
    from public.attempt_answers
   where attempt_question_id = v_question.id;

  if found then
    if v_existing.idempotency_key = p_idempotency_key then
      return jsonb_build_object(
        'accepted', true,
        'replayed', true,
        'action', v_existing.action,
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

  if v_action = 'answer' then
    if p_option_id is null then
      raise exception 'invalid_option' using errcode = '22023';
    end if;
    if not exists (
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
    'position', p_position,
    'is_correct', v_is_correct,
    'points', v_points,
    'correct_option_id', v_version.correct_option_id,
    'explanation', v_version.explanation,
    'score', v_attempt.score
  );
end;
$$;

revoke all on function public.game_submit_answer(uuid, uuid, integer, integer, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_submit_answer(uuid, uuid, integer, integer, text, text) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_submit_answer(uuid, uuid, integer, integer, text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_submit_answer(uuid, uuid, integer, integer, text, text) from authenticated;
  end if;
end
$$;

-- Server-only inventory: how many live questions each active topic can serve today.
create or replace function public.topic_inventory()
returns table (slug text, question_count bigint)
language sql
stable
as $$
  select t.slug, count(q.id)
    from content.topics t
    left join content.question_versions v on v.topic_id = t.id
    left join content.questions q on q.current_version_id = v.id and q.archived_at is null
   where t.is_active
   group by t.slug
   order by t.slug;
$$;

revoke all on function public.topic_inventory() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.topic_inventory() to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.topic_inventory() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.topic_inventory() from authenticated;
  end if;
end
$$;
