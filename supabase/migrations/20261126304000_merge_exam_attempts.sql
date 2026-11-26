-- Signing in has to carry exam workspaces too.
--
-- `game_merge_guest` was written before exam mode existed: it moved quiz attempts and
-- bookmarks and then deleted the guest, so a guest's paper attempts stayed owned by the
-- now-orphaned guest and disappeared from the account it just signed in to. Exam attempts
-- move with the same rule, except that a live study workspace already on the account wins
-- (`exam_attempts_one_study_idx` allows only one) and the guest's copy is retired.

alter table public.account_merges
  add column if not exists exam_attempts_moved integer not null default 0;

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
  v_exam_attempts integer := 0;
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

  -- Exam workspaces follow the same rule as quiz attempts, except that two live study
  -- workspaces for one paper cannot coexist: the account's own copy wins and the guest's
  -- is retired instead of aborting the merge on a unique index.
  update public.exam_attempts guest_attempt
     set state = 'abandoned', updated_at = now()
   where guest_attempt.owner_id = p_guest
     and guest_attempt.mode = 'study'
     and guest_attempt.state in ('ready', 'active', 'paused')
     and exists (
       select 1 from public.exam_attempts keep
        where keep.owner_id = p_target
          and keep.paper_id = guest_attempt.paper_id
          and keep.mode = 'study'
          and keep.state in ('ready', 'active', 'paused')
     );

  update public.exam_attempts
     set owner_id = p_target,
         create_key = create_key || ':g' || left(p_guest::text, 8),
         updated_at = now()
   where owner_id = p_guest;
  get diagnostics v_exam_attempts = row_count;

  delete from public.profiles where id = p_guest;

  insert into public.account_merges
    (guest_id, target_id, attempts_moved, bookmarks_moved, daily_attempts_dropped,
     exam_attempts_moved)
  values (p_guest, p_target, v_attempts, v_bookmarks, v_daily, v_exam_attempts);

  return jsonb_build_object(
    'attempts_moved', v_attempts,
    'bookmarks_moved', v_bookmarks,
    'daily_attempts_dropped', v_daily,
    'exam_attempts_moved', v_exam_attempts
  );
end;
$$;;

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
