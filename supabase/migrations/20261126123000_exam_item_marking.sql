-- Per-item marks. A paper rule gives the default; an item can award something else
-- (a numerical item worth 2 with no penalty, a negative mark of -2/3). Exact rationals
-- are kept as strings so a one-third penalty is never rounded into the stored rule.
alter table content.exam_paper_items
  add column if not exists marking jsonb
    check (marking is null or jsonb_typeof(marking) = 'object');

-- Numerical answers are decimals, not rationals: "1.41" is a valid bound. Re-validate
-- intervals with a decimal format so a paper can accept a range such as 1.41 to 1.42.
create or replace function content.numeric_intervals_are_valid(p_intervals jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p_intervals) = 'array'
    and jsonb_array_length(p_intervals) between 1 and 20
    and not exists (
      select 1 from jsonb_array_elements(p_intervals) as interval
      where jsonb_typeof(interval) <> 'object'
         or coalesce(interval ->> 'min', '') !~ '^-?[0-9]{1,9}(\.[0-9]{1,6})?$'
         or coalesce(interval ->> 'max', '') !~ '^-?[0-9]{1,9}(\.[0-9]{1,6})?$'
         or (interval ->> 'min')::numeric > (interval ->> 'max')::numeric
         or coalesce(interval ->> 'min_inclusive', 'true') not in ('true', 'false')
         or coalesce(interval ->> 'max_inclusive', 'true') not in ('true', 'false')
    );
$$;

drop view if exists content.paper_manifest_items;

create view content.paper_manifest_items as
  select
    pq.paper_id,
    pq.position,
    pq.section_id,
    'single_choice'::text as item_type,
    pq.question_id,
    null::uuid as item_version_id,
    null::jsonb as exam_options,
    null::jsonb as input_policy,
    null::jsonb as marking
  from content.paper_questions pq
  union all
  select
    epi.paper_id,
    epi.position,
    epi.section_id,
    v.item_type,
    null::uuid as question_id,
    epi.item_version_id,
    v.options as exam_options,
    v.input_policy,
    epi.marking
  from content.exam_paper_items epi
  join content.exam_item_versions v on v.id = epi.item_version_id;

comment on view content.paper_manifest_items is
  'Ordered paper content regardless of store: legacy content.paper_questions or typed content.exam_paper_items.';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on content.paper_manifest_items to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on content.paper_manifest_items from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on content.paper_manifest_items from authenticated;
  end if;
end
$$;
