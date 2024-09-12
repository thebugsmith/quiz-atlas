-- Account data export and deletion.
--
-- Deletion removes the person (auth.users) and everything that hangs off them: attempts
-- with their answers, bookmarks, achievements, the profile row that carries the public
-- name, and the reports they filed. Audit rows are kept as the operational record, but
-- only with a null actor — they never held question text or answers.

create or replace function public.game_export_account(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile jsonb;
  v_attempts jsonb;
  v_bookmarks jsonb;
  v_achievements jsonb;
  v_reports jsonb;
begin
  select to_jsonb(p) into v_profile from public.profiles p where p.id = p_owner;

  select coalesce(jsonb_agg(row order by row ->> 'created_at' desc), '[]'::jsonb) into v_attempts
    from (
      select jsonb_build_object(
               'attempt_id', a.id, 'mode', a.mode, 'status', a.status, 'score', a.score,
               'question_count', a.question_count, 'correct_count', a.correct_count,
               'wrong_count', a.wrong_count, 'skipped_count', a.skipped_count,
               'created_at', a.created_at, 'finished_at', a.finished_at,
               'config', a.config,
               'answers', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'position', aq.position,
                          'action', aa.action,
                          'selected_option_id', aa.selected_option_id,
                          'is_correct', aa.is_correct,
                          'points', aa.points_awarded
                        ) order by aq.position)
                   from public.attempt_answers aa
                   join public.attempt_questions aq on aq.id = aa.attempt_question_id
                  where aq.attempt_id = a.id
               ), '[]'::jsonb)
             ) as row
        from public.attempts a
       where a.owner_id = p_owner
    ) rows;

  select coalesce(jsonb_agg(jsonb_build_object(
           'question_id', b.question_id, 'created_at', b.created_at
         ) order by b.created_at), '[]'::jsonb)
    into v_bookmarks
    from public.bookmarks b where b.owner_id = p_owner;

  select coalesce(jsonb_agg(jsonb_build_object(
           'achievement', ua.achievement_key, 'unlocked_at', ua.unlocked_at
         )), '[]'::jsonb)
    into v_achievements
    from public.user_achievements ua where ua.user_id = p_owner;

  select coalesce(jsonb_agg(jsonb_build_object(
           'report_id', r.id, 'reason', r.reason, 'status', r.status,
           'details', r.details, 'created_at', r.created_at
         ) order by r.created_at), '[]'::jsonb)
    into v_reports
    from public.question_reports r where r.reporter_id = p_owner;

  return jsonb_build_object(
    'exported_at', now(),
    'account_id', p_owner,
    'profile', v_profile,
    'attempts', v_attempts,
    'bookmarks', v_bookmarks,
    'achievements', v_achievements,
    'reports', v_reports
  );
end;
$$;

revoke all on function public.game_export_account(uuid) from public;

/**
 * Erases the account. The caller must have proven control of the address: the route
 * compares the typed email with the session's before calling this.
 */
create or replace function public.game_delete_account(p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer := 0;
  v_bookmarks integer := 0;
  v_reports integer := 0;
begin
  if not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select count(*) into v_attempts from public.attempts where owner_id = p_owner;
  select count(*) into v_bookmarks from public.bookmarks where owner_id = p_owner;
  select count(*) into v_reports from public.question_reports where reporter_id = p_owner;

  -- Audit entries survive as records of what staff did, with the actor removed.
  update public.admin_audit set actor_id = null where actor_id = p_owner;

  delete from public.rate_limits where bucket_key like '%' || p_owner::text || '%';

  -- Cascades: attempts -> attempt_questions -> attempt_answers; bookmarks; profiles;
  -- user_achievements; question_reports (reporter_id); account_merges (target_id).
  delete from auth.users where id = p_owner;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (null, 'account_deleted', 'auth_user', null,
          jsonb_build_object('attempts', v_attempts, 'bookmarks', v_bookmarks,
                             'reports', v_reports));

  return jsonb_build_object(
    'deleted', true, 'attempts', v_attempts, 'bookmarks', v_bookmarks, 'reports', v_reports
  );
end;
$$;

revoke all on function public.game_delete_account(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_export_account(uuid) to service_role;
    grant execute on function public.game_delete_account(uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_export_account(uuid) from anon;
    revoke all on function public.game_delete_account(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_export_account(uuid) from authenticated;
    revoke all on function public.game_delete_account(uuid) from authenticated;
  end if;
end
$$;
