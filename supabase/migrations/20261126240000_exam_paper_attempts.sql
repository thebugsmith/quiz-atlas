-- Every attempt this player has on a paper, so a submitted result is reachable later.
-- Without this the only way back to a result was the URL handed out at submit time.
create or replace function public.exam_paper_attempts(p_owner uuid, p_paper_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, content, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'attempt_id', a.id,
           'mode', a.mode,
           'state', a.state,
           'started_at', a.started_at,
           'submitted_at', a.submitted_at,
           'answered', (select count(*)::int from public.exam_responses r
                          where r.attempt_id = a.id and r.response is not null),
           'total', (select count(*)::int from public.exam_attempt_items ai where ai.attempt_id = a.id),
           'total_exact', res.total_exact,
           'total_display', res.total_display
         ) order by a.created_at desc), '[]'::jsonb)
    from public.exam_attempts a
    join content.papers p on p.id = a.paper_id
    left join public.exam_results res on res.attempt_id = a.id
   where a.owner_id = p_owner and p.slug = p_paper_slug;
$$;

revoke all on function public.exam_paper_attempts(uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_paper_attempts(uuid, text) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.exam_paper_attempts(uuid, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.exam_paper_attempts(uuid, text) from authenticated;
  end if;
end
$$;
