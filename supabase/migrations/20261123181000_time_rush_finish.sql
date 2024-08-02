-- Time Rush ends when the clock does: that is a completed run, not an abandoned
-- attempt. Everything else keeps the "answered everything or abandoned" rule.

create or replace function public.game_finish(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
  v_answered integer;
  v_time_up boolean;
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

  v_time_up := v_attempt.expires_at is not null and now() >= v_attempt.expires_at;

  update public.attempts
     set status = (case
                     when v_answered >= question_count then 'completed'
                     when v_time_up then 'completed'
                     else 'abandoned'
                   end)::public.attempt_status,
         finished_at = now()
   where id = v_attempt.id
   returning * into v_attempt;

  return jsonb_build_object(
    'status', v_attempt.status, 'score', v_attempt.score,
    'question_count', v_attempt.question_count, 'answered', v_answered,
    'time_up', v_time_up, 'replayed', false
  );
end;
$$;

revoke all on function public.game_finish(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_finish(uuid, uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_finish(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_finish(uuid, uuid) from authenticated;
  end if;
end
$$;
