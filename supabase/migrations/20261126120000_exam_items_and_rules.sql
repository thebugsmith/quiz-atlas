-- Typed exam items, ordered manifests, marking rules and private keys.
--
-- Quiz questions are single-answer with four options and live in content.questions.
-- A paper can also ask multiple-select and numerical questions, which that model cannot
-- express, so exam content gets its own typed, versioned store. A paper uses one store
-- or the other, never both: legacy papers keep content.paper_questions, typed papers use
-- content.exam_paper_items, and content.paper_manifest_items presents both as one shape.

create table if not exists content.exam_items (
  id uuid primary key default gen_random_uuid(),
  -- Stable import identity. Re-importing the same item updates it instead of copying it.
  external_id text not null unique check (char_length(external_id) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create trigger exam_items_touch_updated_at
  before update on content.exam_items
  for each row execute function content.touch_updated_at();

-- Option lists: 2 to 10 entries, stable ids, no duplicate ids and no duplicate texts
-- (a second identical option is a key ambiguity waiting to happen). Numerical items
-- carry no options at all.
create or replace function content.exam_options_are_valid(p_type text, p_options jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when p_type = 'numerical' then p_options = '[]'::jsonb
    else jsonb_typeof(p_options) = 'array'
      and jsonb_array_length(p_options) between 2 and 10
      and not exists (
        select 1 from jsonb_array_elements(p_options) as option
        where jsonb_typeof(option) <> 'object'
           or coalesce(option ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,16}$'
           or coalesce(btrim(option ->> 'text'), '') = ''
           or char_length(option ->> 'text') > 1000
      )
      and (select count(distinct option ->> 'id') from jsonb_array_elements(p_options) as option)
          = jsonb_array_length(p_options)
      and (select count(distinct lower(btrim(option ->> 'text'))) from jsonb_array_elements(p_options) as option)
          = jsonb_array_length(p_options)
  end;
$$;

-- What a numerical answer field accepts. The accepted values themselves are the key's
-- business; this is only the shape of the input.
create or replace function content.exam_input_policy_is_valid(p_type text, p_input jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when p_type <> 'numerical' then p_input is null
    else jsonb_typeof(p_input) = 'object'
      and (p_input ->> 'kind') in ('integer', 'decimal')
      and (
        p_input ->> 'kind' <> 'decimal'
        or (p_input ->> 'max_decimal_places') is null
        or (p_input ->> 'max_decimal_places') ~ '^[0-6]$'
      )
  end;
$$;

create table if not exists content.exam_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references content.exam_items (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  locale text not null default 'en' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  item_type text not null check (item_type in ('single_choice', 'multiple_select', 'numerical')),
  prompt text not null check (char_length(btrim(prompt)) between 5 and 4000),
  options jsonb not null default '[]'::jsonb,
  input_policy jsonb,
  explanation text check (explanation is null or char_length(btrim(explanation)) between 5 and 4000),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (item_id, version_number),
  constraint exam_item_versions_options_valid
    check (content.exam_options_are_valid(item_type, options)),
  constraint exam_item_versions_input_valid
    check (content.exam_input_policy_is_valid(item_type, input_policy))
);

create index if not exists exam_item_versions_by_item
  on content.exam_item_versions (item_id, version_number desc);
create index if not exists exam_item_versions_hash_idx
  on content.exam_item_versions (content_hash);

-- Which version of an item a paper serves. One live locale pointer per item, the same
-- idea as content.question_localizations.
create table if not exists content.exam_item_localizations (
  item_id uuid not null references content.exam_items (id) on delete cascade,
  locale text not null,
  current_version_id uuid not null references content.exam_item_versions (id) on delete restrict,
  primary key (item_id, locale)
);

-- Ordered membership of a typed paper. The paper owns the order; the item version owns
-- the text. Marks overrides here are what the paper actually awards for this slot.
create table if not exists content.exam_paper_items (
  paper_id uuid not null references content.papers (id) on delete cascade,
  item_version_id uuid not null references content.exam_item_versions (id) on delete restrict,
  section_id uuid references content.paper_sections (id) on delete set null,
  position integer not null check (position > 0),
  marks_correct numeric(6, 2),
  marks_wrong numeric(6, 2),
  primary key (paper_id, item_version_id),
  unique (paper_id, position)
);

create index if not exists exam_paper_items_by_paper
  on content.exam_paper_items (paper_id, position);

-- One read model for both stores, so the solver and the catalog never branch on paper
-- style. Legacy single-choice papers keep their ids and their four printed options.
create or replace view content.paper_manifest_items as
  select
    pq.paper_id,
    pq.position,
    pq.section_id,
    'single_choice'::text as item_type,
    pq.question_id,
    null::uuid as item_version_id,
    null::jsonb as exam_options,
    null::jsonb as input_policy,
    null::numeric as marks_correct,
    null::numeric as marks_wrong
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
    epi.marks_correct,
    epi.marks_wrong
  from content.exam_paper_items epi
  join content.exam_item_versions v on v.id = epi.item_version_id;

comment on view content.paper_manifest_items is
  'Ordered paper content regardless of store: legacy content.paper_questions or typed content.exam_paper_items.';

-- Exact rationals: "4", "-1", "-2/3". No floats anywhere in a rule, a key or an award.
create or replace function content.is_rational(value text)
returns boolean
language sql
immutable
as $$ select value ~ '^-?[0-9]{1,9}(/[1-9][0-9]{0,3})?$' $$;

-- A rule version is a finite, validated structure. Nothing in it is executable, and an
-- import cannot smuggle a different policy in as a comment.
create or replace function content.exam_rule_is_valid(
  p_timing jsonb, p_marking jsonb, p_navigation jsonb, p_choices jsonb, p_display jsonb
)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p_timing) = 'object'
    and (p_timing ->> 'kind') in ('whole_paper', 'sections')
    and (
      (p_timing ->> 'kind' = 'whole_paper' and (p_timing ->> 'duration_seconds') ~ '^[1-9][0-9]{0,5}$')
      or (p_timing ->> 'kind' = 'sections' and jsonb_typeof(p_timing -> 'sections') = 'array')
    )
    and jsonb_typeof(p_marking) = 'object'
    and content.is_rational(coalesce(p_marking ->> 'correct', ''))
    and content.is_rational(coalesce(p_marking ->> 'incorrect', ''))
    and content.is_rational(coalesce(p_marking ->> 'unattempted', ''))
    and (
      p_marking -> 'partial' is null
      or (
        jsonb_typeof(p_marking -> 'partial') = 'object'
        and (p_marking -> 'partial' ->> 'policy') in
            ('none', 'correct_subset_count', 'proportional', 'all_or_nothing')
      )
    )
    and jsonb_typeof(p_navigation) = 'object'
    and (p_navigation ->> 'kind') in ('free', 'sequential')
    and jsonb_typeof(p_choices) = 'object'
    and (
      (p_choices ->> 'max_questions') is null
      or (p_choices ->> 'max_questions') ~ '^[1-9][0-9]{0,2}$'
    )
    and jsonb_typeof(p_display) = 'object'
    and (p_display ->> 'rounding') in ('none', 'half_up')
    and coalesce(p_display ->> 'places', '0') ~ '^[0-2]$';
$$;

create table if not exists content.exam_rule_versions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references content.papers (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'superseded')),
  timing jsonb not null,
  marking jsonb not null,
  navigation jsonb not null,
  choices jsonb not null default '{}'::jsonb,
  display jsonb not null default '{"rounding":"none","places":0}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (paper_id, version_number),
  unique (id, paper_id),
  constraint exam_rule_versions_valid
    check (content.exam_rule_is_valid(timing, marking, navigation, choices, display)),
  constraint exam_rule_versions_published_stamped
    check (status = 'draft' or published_at is not null)
);

-- Section overrides: an independently timed section, a different partial-credit rule,
-- or a "choose N of M" restriction. Absent keys inherit from the paper rule.
create table if not exists content.exam_section_rules (
  rule_version_id uuid not null references content.exam_rule_versions (id) on delete cascade,
  paper_id uuid not null,
  section_id uuid not null references content.paper_sections (id) on delete cascade,
  timing jsonb check (timing is null or jsonb_typeof(timing) = 'object'),
  marking jsonb check (marking is null or jsonb_typeof(marking) = 'object'),
  choices jsonb check (choices is null or jsonb_typeof(choices) = 'object'),
  primary key (rule_version_id, section_id),
  constraint exam_section_rules_same_paper
    foreign key (rule_version_id, paper_id)
    references content.exam_rule_versions (id, paper_id)
    on delete cascade
);

-- Private grading keys. The row is the version; the items below are the answers.
alter table content.exam_key_versions
  add column if not exists content_hash text check (content_hash is null or content_hash ~ '^[a-f0-9]{64}$');

create table if not exists content.exam_key_items (
  id uuid not null default gen_random_uuid(),
  paper_id uuid not null,
  key_version_id uuid not null,
  item_version_id uuid not null references content.exam_item_versions (id) on delete restrict,
  -- Single choice: one or more acceptable ids (a key amendment can accept a second one
  -- while the UI still allows one selection).
  accepted_option_ids text[],
  -- Multiple select: the exact correct set.
  correct_option_ids text[],
  -- Numerical: accepted closed/open intervals, exact decimal strings.
  accepted_numeric_intervals jsonb,
  exceptional_policy text check (exceptional_policy in ('exclude', 'award_all', 'award_attempted')),
  primary key (key_version_id, item_version_id),
  constraint exam_key_items_same_paper
    foreign key (key_version_id, paper_id)
    references content.exam_key_versions (id, paper_id)
    on delete cascade
);

create index if not exists exam_key_items_by_paper_item
  on content.exam_key_items (paper_id, item_version_id);

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
         or not content.is_rational(coalesce(interval ->> 'min', ''))
         or not content.is_rational(coalesce(interval ->> 'max', ''))
         or (interval ->> 'min')::numeric > (interval ->> 'max')::numeric
         or coalesce(interval ->> 'min_inclusive', 'true') not in ('true', 'false')
         or coalesce(interval ->> 'max_inclusive', 'true') not in ('true', 'false')
    );
$$;

-- The key must match the item it grades: a multiple-select key on a single-choice item,
-- an option id the item never printed, or a numerical key with no interval is rejected
-- here rather than at grading time.
create or replace function content.validate_exam_key_item()
returns trigger
language plpgsql
as $$
declare
  v_type text;
  v_options jsonb;
begin
  select v.item_type, v.options into v_type, v_options
    from content.exam_item_versions v where v.id = new.item_version_id;

  if not found then
    raise exception 'unknown_item_version' using errcode = '23503';
  end if;

  if not exists (
    select 1 from content.exam_paper_items epi
     where epi.paper_id = new.paper_id and epi.item_version_id = new.item_version_id
  ) then
    raise exception 'key_item_not_in_paper' using errcode = '23514';
  end if;

  if new.exceptional_policy in ('exclude', 'award_all') then
    return new;
  end if;

  if v_type = 'single_choice' then
    if new.correct_option_ids is not null or new.accepted_numeric_intervals is not null then
      raise exception 'key_item_shape_mismatch' using errcode = '23514';
    end if;
    if new.accepted_option_ids is null or array_length(new.accepted_option_ids, 1) is null then
      raise exception 'key_item_missing_answer' using errcode = '23514';
    end if;
    if exists (
      select 1 from unnest(new.accepted_option_ids) as id
       where not exists (select 1 from jsonb_array_elements(v_options) as option where option ->> 'id' = id)
    ) then
      raise exception 'key_item_unknown_option' using errcode = '23514';
    end if;
    return new;
  end if;

  if v_type = 'multiple_select' then
    if new.accepted_option_ids is not null or new.accepted_numeric_intervals is not null then
      raise exception 'key_item_shape_mismatch' using errcode = '23514';
    end if;
    if new.correct_option_ids is null or array_length(new.correct_option_ids, 1) is null then
      raise exception 'key_item_missing_answer' using errcode = '23514';
    end if;
    if exists (
      select 1 from unnest(new.correct_option_ids) as id
       where not exists (select 1 from jsonb_array_elements(v_options) as option where option ->> 'id' = id)
    ) then
      raise exception 'key_item_unknown_option' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.accepted_option_ids is not null or new.correct_option_ids is not null then
    raise exception 'key_item_shape_mismatch' using errcode = '23514';
  end if;
  if new.accepted_numeric_intervals is null or not content.numeric_intervals_are_valid(new.accepted_numeric_intervals) then
    raise exception 'key_item_invalid_intervals' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger exam_key_items_valid
  before insert or update on content.exam_key_items
  for each row execute function content.validate_exam_key_item();

revoke all on function content.validate_exam_key_item() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on
      content.exam_items,
      content.exam_item_versions,
      content.exam_item_localizations,
      content.exam_paper_items,
      content.exam_rule_versions,
      content.exam_section_rules,
      content.exam_key_items
    to service_role;
    grant select on content.paper_manifest_items to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on
      content.exam_items, content.exam_item_versions, content.exam_item_localizations,
      content.exam_paper_items, content.exam_rule_versions, content.exam_section_rules,
      content.exam_key_items, content.paper_manifest_items
    from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on
      content.exam_items, content.exam_item_versions, content.exam_item_localizations,
      content.exam_paper_items, content.exam_rule_versions, content.exam_section_rules,
      content.exam_key_items, content.paper_manifest_items
    from authenticated;
  end if;
end
$$;
