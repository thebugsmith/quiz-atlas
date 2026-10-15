-- Find the resumable study attempt for a paper, so the paper page can offer Continue
-- without loading the whole manifest.
create or replace function public.exam_open_attempt(p_owner uuid, p_paper_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, content, pg_temp
as $$
  select jsonb_build_object(
           'attempt_id', a.id,
           'state', a.state,
           'created_at', a.created_at,
           'answered', (select count(*)::int from public.exam_responses r
                          join public.exam_attempt_items ai on ai.id = r.attempt_item_id
                         where r.attempt_id = a.id and r.response is not null),
           'total', (select count(*)::int from public.exam_attempt_items ai where ai.attempt_id = a.id),
           'cursor_position', (
             select ai.position from public.exam_attempt_items ai
              where ai.id = a.cursor_item_id
           )
         )
    from public.exam_attempts a
    join content.papers p on p.id = a.paper_id
   where a.owner_id = p_owner and p.slug = p_paper_slug
     and a.mode = 'study' and a.state in ('ready', 'active', 'paused')
   limit 1;
$$;

revoke all on function public.exam_open_attempt(uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_open_attempt(uuid, text) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.exam_open_attempt(uuid, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.exam_open_attempt(uuid, text) from authenticated;
  end if;
end
$$;
