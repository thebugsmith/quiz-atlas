-- Quarantine has to show up where players look, not only where questions are dealt.
-- Without this the picker would promise a question that no new quiz can include.

create or replace function public.topic_summaries()
returns table (
  slug text,
  name text,
  description text,
  icon_key text,
  display_color text,
  sort_order integer,
  available bigint
)
language sql
stable
as $$
  select t.slug, t.name, t.description, t.icon_key, t.display_color, t.sort_order,
         count(q.id) as available
    from content.topics t
    left join content.question_versions v on v.topic_id = t.id
    left join content.questions q
      on q.current_version_id = v.id
     and q.archived_at is null
     and q.quarantined_at is null
   where t.is_active
   group by t.id, t.slug, t.name, t.description, t.icon_key, t.display_color, t.sort_order
   order by t.sort_order;
$$;

revoke all on function public.topic_summaries() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.topic_summaries() to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.topic_summaries() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.topic_summaries() from authenticated;
  end if;
end
$$;
