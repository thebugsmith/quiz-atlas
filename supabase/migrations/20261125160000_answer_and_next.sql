-- Answering and advancing in one server call.
--
-- The browser used to POST the answer, then POST for the next question: two round trips
-- from the app to the database region per question. Everything below runs inside one
-- function, so it is one hop from the browser and no extra network between the steps.

create or replace function public.game_answer_and_next(
  p_attempt_id uuid,
  p_owner uuid,
  p_position integer,
  p_option_id integer,
  p_action text,
  p_idempotency_key text,
  p_mode public.attempt_mode
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_advanced jsonb;
  v_current jsonb;
begin
  v_result := case p_mode
    when 'daily' then public.game_submit_daily_answer(
      p_attempt_id, p_owner, p_position, p_option_id, p_action, p_idempotency_key)
    when 'survival' then public.game_submit_survival_answer(
      p_attempt_id, p_owner, p_position, p_option_id, p_action, p_idempotency_key)
    else public.game_submit_answer(
      p_attempt_id, p_owner, p_position, p_option_id, p_action, p_idempotency_key)
  end;

  -- Finished runs, and survival runs out of lives, have no next question to hand back.
  if coalesce((v_result ->> 'finished')::boolean, false)
     or coalesce((v_result ->> 'lives_left')::integer, 1) = 0 then
    return v_result || jsonb_build_object('next', null);
  end if;

  v_advanced := public.game_advance(p_attempt_id, p_owner);
  v_current := public.game_current_question(p_attempt_id, p_owner);

  return v_result || jsonb_build_object(
    'next',
    jsonb_build_object(
      'attempt', coalesce(v_advanced -> 'attempt', v_current -> 'attempt'),
      'question', coalesce(v_current -> 'question', v_current)
    )
  );
end;
$$;

revoke all on function public.game_answer_and_next(uuid, uuid, integer, integer, text, text, public.attempt_mode) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_answer_and_next(uuid, uuid, integer, integer, text, text, public.attempt_mode) to service_role;
  end if;
end
$$;
