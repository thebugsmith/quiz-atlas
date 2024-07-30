-- Retention rules, enforced on read and available to a scheduled cleanup.
--
-- Spec 07: unused `ready` attempts expire after an hour, and an untimed active
-- attempt is abandoned after seven days of inactivity. Expiry is a retention rule,
-- not a gameplay clock — Classic has no countdown — so it is applied whenever an
-- attempt is opened and, later, by the scheduled job.

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

  if v_attempt.status = 'ready' and v_attempt.created_at < now() - interval '1 hour' then
    update public.attempts
       set status = 'expired', finished_at = now()
     where id = p_attempt_id
     returning status into v_status;
    return jsonb_build_object('status', v_status, 'expired', true);
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
      return jsonb_build_object('status', v_status, 'expired', true);
    end if;
  end if;

  return jsonb_build_object('status', v_attempt.status, 'expired', false);
end;
$$;

-- Same rules for every stale attempt at once; the scheduled job in milestone 23
-- calls this, and it is safe to run repeatedly.
create or replace function public.expire_stale_attempts(p_ready_minutes integer default 60, p_active_days integer default 7)
returns jsonb
language plpgsql
as $$
declare
  v_ready integer;
  v_active integer;
begin
  with expired as (
    update public.attempts
       set status = 'expired', finished_at = now()
     where status = 'ready'
       and created_at < now() - make_interval(mins => p_ready_minutes)
     returning 1
  )
  select count(*) into v_ready from expired;

  with abandoned as (
    update public.attempts a
       set status = 'abandoned', finished_at = now()
     where a.status = 'active'
       and greatest(
             coalesce(a.started_at, a.created_at),
             coalesce((select max(aa.accepted_at)
                         from public.attempt_answers aa
                        where aa.attempt_id = a.id), a.created_at)
           ) < now() - make_interval(days => p_active_days)
     returning 1
  )
  select count(*) into v_active from abandoned;

  return jsonb_build_object('expired_ready', v_ready, 'abandoned_active', v_active);
end;
$$;

revoke all on function public.game_expire_attempt(uuid, uuid) from public;
revoke all on function public.expire_stale_attempts(integer, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_expire_attempt(uuid, uuid) to service_role;
    grant execute on function public.expire_stale_attempts(integer, integer) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_expire_attempt(uuid, uuid) from anon;
    revoke all on function public.expire_stale_attempts(integer, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_expire_attempt(uuid, uuid) from authenticated;
    revoke all on function public.expire_stale_attempts(integer, integer) from authenticated;
  end if;
end
$$;
