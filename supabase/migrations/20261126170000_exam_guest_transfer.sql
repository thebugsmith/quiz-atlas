-- A guest's exam work follows them into a permanent account, the same way quiz attempts do.
--
-- Two collisions are possible and both are handled explicitly:
--   * create keys are scoped per owner, so they are suffixed before the move;
--   * one resumable study attempt per owner and paper, so when the account already has a
--     workspace for that paper the guest's duplicate is dropped rather than merging two
--     answer sets into one paper. The account's workspace stays authoritative.
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
  v_exam_dropped integer := 0;
  v_exam_favorites integer := 0;
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

  -- Exam workspaces: drop a guest duplicate of a paper the account already studies,
  -- then move the rest.
  with duplicates as (
    delete from public.exam_attempts guest
     where guest.owner_id = p_guest
       and guest.mode = 'study'
       and guest.state in ('ready', 'active', 'paused')
       and exists (
         select 1 from public.exam_attempts keep
          where keep.owner_id = p_target
            and keep.paper_id = guest.paper_id
            and keep.mode = 'study'
            and keep.state in ('ready', 'active', 'paused')
       )
     returning 1
  )
  select count(*) into v_exam_dropped from duplicates;

  update public.exam_attempts
     set owner_id = p_target,
         create_key = create_key || ':g' || left(p_guest::text, 8)
   where owner_id = p_guest;
  get diagnostics v_exam_attempts = row_count;

  insert into public.exam_favorites (user_id, paper_id, created_at)
  select p_target, f.paper_id, f.created_at
    from public.exam_favorites f
   where f.user_id = p_guest
  on conflict do nothing;

  delete from public.exam_favorites where user_id = p_guest;
  get diagnostics v_exam_favorites = row_count;

  delete from public.profiles where id = p_guest;

  insert into public.account_merges
    (guest_id, target_id, attempts_moved, bookmarks_moved, daily_attempts_dropped)
  values (p_guest, p_target, v_attempts, v_bookmarks, v_daily);

  return jsonb_build_object(
    'attempts_moved', v_attempts,
    'bookmarks_moved', v_bookmarks,
    'daily_attempts_dropped', v_daily,
    'exam_attempts_moved', v_exam_attempts,
    'exam_attempts_dropped', v_exam_dropped,
    'exam_favorites_moved', v_exam_favorites
  );
end;
$$;

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
