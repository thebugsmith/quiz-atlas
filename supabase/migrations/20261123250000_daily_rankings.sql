-- Daily rankings.
--
-- The board is built from stored attempts only: there is no endpoint that accepts a
-- score, so a client cannot submit one. Eligibility is fixed by the rules — the same
-- challenge, a ranked attempt, completed, not voided.

alter table public.daily_challenges
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

create or replace function public.game_daily_leaderboard(
  p_viewer uuid,
  p_date date,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_challenge public.daily_challenges%rowtype;
  v_closed boolean;
  v_rows jsonb;
  v_total integer;
  v_me jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  select * into v_challenge from public.daily_challenges where challenge_date = p_date;
  if not found then
    return jsonb_build_object(
      'date', p_date, 'closed', true, 'exists', false,
      'rows', '[]'::jsonb, 'total', 0, 'me', null, 'voided', false
    );
  end if;

  v_closed := v_challenge.closed_at is not null
              or v_challenge.challenge_date < (now() at time zone 'utc')::date;

  -- Before closure the board is private: no rows, and only your own standing.
  select count(*) into v_total
    from public.attempts a
   where a.mode = 'daily'
     and (a.config ->> 'challengeId') = v_challenge.id::text
     and (a.config ->> 'ranked') = 'true'
     and a.status = 'completed'
     and a.voided_at is null;

  select jsonb_build_object(
           'rank', 1 + (
             select count(*) from public.attempts rival
              where rival.mode = 'daily'
                and (rival.config ->> 'challengeId') = v_challenge.id::text
                and (rival.config ->> 'ranked') = 'true'
                and rival.status = 'completed'
                and rival.voided_at is null
                and rival.score > mine.score
           ),
           'score', mine.score,
           'correct_count', mine.correct_count,
           'question_count', mine.question_count
         )
    into v_me
    from public.attempts mine
   where mine.owner_id = p_viewer
     and mine.mode = 'daily'
     and (mine.config ->> 'challengeId') = v_challenge.id::text
     and (mine.config ->> 'ranked') = 'true'
     and mine.status = 'completed'
     and mine.voided_at is null
   limit 1;

  if v_closed and v_challenge.voided_at is null then
    select coalesce(jsonb_agg(row order by position), '[]'::jsonb) into v_rows
      from (
        select jsonb_build_object(
                 'rank', rank() over (order by a.score desc),
                 'display_name', case when a.owner_id = p_viewer or coalesce(p.leaderboard_public, true)
                                      then coalesce(p.display_name, 'Player ' || upper(left(replace(a.owner_id::text, '-', ''), 6)))
                                      else null end,
                 'score', a.score,
                 'correct_count', a.correct_count,
                 'question_count', a.question_count,
                 'is_self', a.owner_id = p_viewer
               ) as row,
               rank() over (order by a.score desc) as position
          from public.attempts a
          left join public.profiles p on p.id = a.owner_id
         where a.mode = 'daily'
           and (a.config ->> 'challengeId') = v_challenge.id::text
           and (a.config ->> 'ranked') = 'true'
           and a.status = 'completed'
           and a.voided_at is null
         order by a.score desc
         limit v_limit offset v_offset
      ) rows;
  else
    v_rows := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'date', v_challenge.challenge_date,
    'closed', v_closed,
    'exists', true,
    'voided', v_challenge.voided_at is not null,
    'void_reason', v_challenge.void_reason,
    'rows', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'me', v_me
  );
end;
$$;

revoke all on function public.game_daily_leaderboard(uuid, date, integer, integer) from public;

/**
 * Voids a whole challenge: the audit records why, every ranked attempt becomes voided
 * (excluded from the board and from rankings), and stored scores are left untouched.
 */
create or replace function public.admin_void_daily_challenge(
  p_actor uuid,
  p_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_challenge public.daily_challenges%rowtype;
  v_count integer := 0;
begin
  perform public.admin_require(p_actor);

  select * into v_challenge from public.daily_challenges where challenge_date = p_date for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_challenge.voided_at is not null then
    raise exception 'already_voided' using errcode = 'P0001';
  end if;

  update public.daily_challenges
     set voided_at = now(), void_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = v_challenge.id;

  update public.attempts
     set voided_at = now(),
         void_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'daily challenge voided')
   where mode = 'daily'
     and (config ->> 'challengeId') = v_challenge.id::text
     and voided_at is null;
  get diagnostics v_count = row_count;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'daily_challenge_voided', 'daily_challenge', v_challenge.id,
          jsonb_build_object('date', p_date, 'reason', p_reason, 'attempts_voided', v_count));

  return jsonb_build_object(
    'challenge_id', v_challenge.id, 'date', p_date, 'attempts_voided', v_count
  );
end;
$$;

revoke all on function public.admin_void_daily_challenge(uuid, date, text) from public;

-- Display name and visibility, editable by the owner only.
create or replace function public.game_public_profile(p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'display_name', p.display_name,
           'username', p.username,
           'leaderboard_public', p.leaderboard_public
         )
    from public.profiles p
   where p.id = p_owner;
$$;

create or replace function public.game_update_profile(
  p_owner uuid,
  p_display_name text,
  p_leaderboard_public boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name, leaderboard_public)
  values (p_owner, v_name, coalesce(p_leaderboard_public, true))
  on conflict (id) do update
    set display_name = excluded.display_name,
        leaderboard_public = excluded.leaderboard_public,
        updated_at = now();

  return public.game_public_profile(p_owner);
end;
$$;

revoke all on function public.game_public_profile(uuid) from public;
revoke all on function public.game_update_profile(uuid, text, boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_daily_leaderboard(uuid, date, integer, integer) to service_role;
    grant execute on function public.admin_void_daily_challenge(uuid, date, text) to service_role;
    grant execute on function public.game_public_profile(uuid) to service_role;
    grant execute on function public.game_update_profile(uuid, text, boolean) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_daily_leaderboard(uuid, date, integer, integer) from anon;
    revoke all on function public.admin_void_daily_challenge(uuid, date, text) from anon;
    revoke all on function public.game_public_profile(uuid) from anon;
    revoke all on function public.game_update_profile(uuid, text, boolean) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_daily_leaderboard(uuid, date, integer, integer) from authenticated;
    revoke all on function public.admin_void_daily_challenge(uuid, date, text) from authenticated;
    revoke all on function public.game_public_profile(uuid) from authenticated;
    revoke all on function public.game_update_profile(uuid, text, boolean) from authenticated;
  end if;
end
$$;
