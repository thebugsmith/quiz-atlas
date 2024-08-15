-- Operational safeguards: durable rate limits, guest cleanup, hot-path indexes.
--
-- The limiter is a table, not an in-memory counter, so two app instances share the same
-- budget and a restart cannot reset an abuser's window.

create table if not exists public.rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket_key, window_start)
);

comment on table public.rate_limits is
  'Fixed-window counters. Rows older than the retention sweep are disposable.';

alter table public.rate_limits enable row level security;

/**
 * Counts one hit and reports whether it fits the budget.
 * Windows are aligned to the epoch, so every caller agrees on when the window ends.
 */
create or replace function public.rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz := to_timestamp(
    floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1)
  );
  v_hits integer;
begin
  insert into public.rate_limits (bucket_key, window_start, hits)
  values (p_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
    do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- Opportunistic sweep: the table only ever holds a day of windows.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'used', v_hits,
    'limit', p_limit,
    'reset_at', v_window_start + make_interval(secs => greatest(p_window_seconds, 1))
  );
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public;

/**
 * Deletes anonymous identities that never played, older than p_older_than. Guests with
 * history are kept: their attempts are someone's only record of a quiz.
 */
create or replace function public.admin_cleanup_guests(p_older_than interval default '30 days')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  with doomed as (
    select u.id
      from auth.users u
     where u.is_anonymous
       and u.created_at < now() - p_older_than
       and not exists (select 1 from public.attempts a where a.owner_id = u.id)
       and not exists (select 1 from public.bookmarks b where b.owner_id = u.id)
       and not exists (select 1 from public.question_reports r where r.reporter_id = u.id)
     limit 5000
  )
  delete from auth.users u using doomed d where u.id = d.id;

  get diagnostics v_deleted = row_count;

  insert into public.admin_audit (actor_id, action, entity, detail)
  values (null, 'guest_cleanup', 'auth_user',
          jsonb_build_object('older_than', p_older_than::text, 'deleted', v_deleted));

  return jsonb_build_object('deleted', v_deleted, 'older_than', p_older_than::text);
end;
$$;

revoke all on function public.admin_cleanup_guests(interval) from public;

-- Indexes for the shapes the app actually queries.
create index if not exists attempt_answers_attempt_idx
  on public.attempt_answers (attempt_id);
create index if not exists bookmarks_question_idx
  on public.bookmarks (question_id);
create index if not exists question_versions_question_version_idx
  on content.question_versions (question_id, version_number desc);
create index if not exists attempts_owner_mode_idx
  on public.attempts (owner_id, mode, created_at desc);
create index if not exists question_reports_reporter_idx
  on public.question_reports (reporter_id, created_at desc);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
    grant execute on function public.admin_cleanup_guests(interval) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rate_limit_hit(text, integer, integer) from anon;
    revoke all on function public.admin_cleanup_guests(interval) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.rate_limit_hit(text, integer, integer) from authenticated;
    revoke all on function public.admin_cleanup_guests(interval) from authenticated;
  end if;
end
$$;
