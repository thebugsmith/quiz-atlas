-- Permanent accounts.
--
-- A guest can keep playing forever; these tables only exist so their work can
-- follow them into a permanent identity. Nothing here trusts the client for
-- ownership: the guest id comes from an httpOnly marker cookie set while the
-- guest session was live, and the target comes from the verified session.

create table if not exists public.account_merges (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null,
  target_id uuid not null references auth.users (id) on delete cascade,
  attempts_moved integer not null default 0,
  bookmarks_moved integer not null default 0,
  daily_attempts_dropped integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.account_merges is
  'Audit of guest-to-account transfers. Service role only; no client policies.';

alter table public.account_merges enable row level security;

/**
 * Moves a guest's practice-eligible history onto a permanent account.
 *
 * Ranked daily attempts are deliberately dropped: a guest's daily run was never
 * eligible for the account's ranking, and promoting it after the fact would let
 * anyone farm a fresh account by replaying dailies as a guest. Everything else
 * (classic, time rush, practice, survival) moves with its answers attached.
 */
create or replace function public.game_merge_guest(p_guest uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guest_anonymous boolean;
  v_target_anonymous boolean;
  v_attempts integer := 0;
  v_daily integer := 0;
  v_bookmarks integer := 0;
begin
  if p_guest is null or p_target is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_guest = p_target then
    raise exception 'same_identity' using errcode = '22023';
  end if;

  select is_anonymous into v_guest_anonymous from auth.users where id = p_guest;
  if not found then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  if not v_guest_anonymous then
    raise exception 'guest_not_guest' using errcode = 'P0001';
  end if;

  select is_anonymous into v_target_anonymous from auth.users where id = p_target;
  if not found then
    raise exception 'target_not_found' using errcode = 'P0002';
  end if;
  if v_target_anonymous then
    raise exception 'target_not_permanent' using errcode = 'P0001';
  end if;

  select count(*) into v_daily
    from public.attempts
   where owner_id = p_guest and mode = 'daily';

  delete from public.attempts
   where owner_id = p_guest and mode = 'daily';

  -- create_key is an idempotency handle scoped to one owner; suffix it so a
  -- collision with an attempt the account already has cannot abort the move.
  update public.attempts
     set owner_id = p_target,
         create_key = create_key || ':g' || left(p_guest::text, 8)
   where owner_id = p_guest;
  get diagnostics v_attempts = row_count;

  delete from public.bookmarks b
   where b.owner_id = p_guest
     and exists (
       select 1 from public.bookmarks keep
        where keep.owner_id = p_target and keep.question_id = b.question_id
     );

  update public.bookmarks set owner_id = p_target where owner_id = p_guest;
  get diagnostics v_bookmarks = row_count;

  delete from public.profiles where id = p_guest;

  insert into public.account_merges
    (guest_id, target_id, attempts_moved, bookmarks_moved, daily_attempts_dropped)
  values (p_guest, p_target, v_attempts, v_bookmarks, v_daily);

  return jsonb_build_object(
    'attempts_moved', v_attempts,
    'bookmarks_moved', v_bookmarks,
    'daily_attempts_dropped', v_daily
  );
end;
$$;

-- Runs as its owner because it must read auth.users to prove both identities are real
-- and that the guest is still a guest. Only the server reaches it.
revoke all on function public.game_merge_guest(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_merge_guest(uuid, uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_merge_guest(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_merge_guest(uuid, uuid) from authenticated;
  end if;
end
$$;

-- A permanent account keeps a display name; guests get one lazily on first need.
create or replace function public.game_ensure_profile(p_user uuid, p_display_name text default null)
returns jsonb
language plpgsql
as $$
declare
  v_profile public.profiles%rowtype;
  v_name text;
begin
  select * into v_profile from public.profiles where id = p_user;
  if found then
    return to_jsonb(v_profile);
  end if;

  v_name := coalesce(
    nullif(btrim(p_display_name), ''),
    'Player ' || upper(left(replace(p_user::text, '-', ''), 6))
  );
  if char_length(v_name) < 2 then
    v_name := 'Player ' || upper(left(replace(p_user::text, '-', ''), 6));
  end if;

  insert into public.profiles (id, display_name) values (p_user, left(v_name, 40))
  on conflict (id) do nothing
  returning * into v_profile;

  return to_jsonb(v_profile);
end;
$$;

revoke all on function public.game_ensure_profile(uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_ensure_profile(uuid, text) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_ensure_profile(uuid, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_ensure_profile(uuid, text) from authenticated;
  end if;
end
$$;
