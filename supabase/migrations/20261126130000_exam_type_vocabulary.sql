-- Align the supported-response vocabulary with the import contract and the solver:
-- single_choice, multiple_select, numerical. The earlier column accepted the shorter
-- single/multiple spellings, which would let a paper declare a capability that no item
-- type maps to.
create or replace function content.exam_types_are_valid(kinds text[])
returns boolean
language sql
immutable
as $$
  select kinds is not null
    and array_length(kinds, 1) is not null
    and not exists (
      select 1 from unnest(kinds) as kind
      where kind not in ('single_choice', 'multiple_select', 'numerical')
    )
    and (select count(distinct k) from unnest(kinds) as k) = array_length(kinds, 1);
$$;

alter table content.papers
  alter column supported_types set default '{single_choice}';

update content.papers
   set supported_types = array_replace(array_replace(supported_types, 'single', 'single_choice'), 'multiple', 'multiple_select')
 where supported_types && array['single', 'multiple'];
