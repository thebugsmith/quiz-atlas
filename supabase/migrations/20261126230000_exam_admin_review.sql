-- Admin review: publish gates, key amendments, explicit regrades.
--
-- A key amendment never rewrites a result. It creates a new key version, and a regrade is a
-- separate row in exam_regrades that names the key it used, so the original marks stay on
-- record exactly as they were awarded.

create table if not exists public.exam_regrades (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  key_version_id uuid not null references content.exam_key_versions (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  total_exact text not null,
  total_display numeric(8, 2) not null,
  breakdown jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists exam_regrades_by_attempt on public.exam_regrades (attempt_id, created_at desc);

alter table public.exam_regrades enable row level security;

create policy exam_regrades_select_own on public.exam_regrades
  for select to authenticated using (
    exists (select 1 from public.exam_attempts a
             where a.id = exam_regrades.attempt_id and a.owner_id = (select auth.uid()))
  );

/** Every paper with the state an editor needs to judge readiness. */
create or replace function public.exam_admin_papers(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_role public.admin_role;
begin
  v_role := public.admin_role_of(p_actor);
  if v_role is null then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'slug', p.slug,
             'label', coalesce(p.paper_label, p.paper_code, p.slug),
             'exam', e.name,
             'year', p.year,
             'status', p.status,
             'source_status', p.source_status,
             'items', (select count(*)::int from content.paper_manifest_items m where m.paper_id = p.id),
             'keyed', (
               select count(*)::int from content.exam_key_items ki
                join content.exam_key_versions kv on kv.id = ki.key_version_id
               where kv.paper_id = p.id
                 and kv.version_number = (select max(version_number) from content.exam_key_versions k2 where k2.paper_id = p.id)
             ),
             'key_version', (
               select max(version_number) from content.exam_key_versions k where k.paper_id = p.id
             ),
             'key_status', (
               select k.status from content.exam_key_versions k
                where k.paper_id = p.id order by version_number desc limit 1
             ),
             'rule_version', (
               select max(version_number) from content.exam_rule_versions r where r.paper_id = p.id
             ),
             'attempts', (select count(*)::int from public.exam_attempts a where a.paper_id = p.id),
             'results', (
               select count(*)::int from public.exam_results r
                join public.exam_attempts a2 on a2.id = r.attempt_id
               where a2.paper_id = p.id
             )
           ) order by e.name, p.year desc)
      from content.papers p
      join content.exams e on e.id = p.exam_id
     where p.status <> 'archived'
  ), '[]'::jsonb);
end;
$$;

/**
 * Publishing is gated: every item must have a key row, a rule must exist, and a manifest
 * must be published. An incomplete paper is refused instead of shown behind a broken Start.
 */
create or replace function public.exam_admin_set_status(
  p_actor uuid, p_paper_slug text, p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_role public.admin_role;
  v_paper content.papers%rowtype;
  v_items integer;
  v_keyed integer;
  v_rule integer;
begin
  v_role := public.admin_role_of(p_actor);
  if v_role is null then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if v_role <> 'admin' then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_paper from content.papers where slug = p_paper_slug;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_status = 'published' then
    select count(*)::int into v_items from content.paper_manifest_items where paper_id = v_paper.id;
    select count(*)::int into v_keyed
      from content.exam_key_items ki
      join content.exam_key_versions kv on kv.id = ki.key_version_id
     where kv.paper_id = v_paper.id
       and kv.version_number = (select max(version_number) from content.exam_key_versions k where k.paper_id = v_paper.id);
    select count(*)::int into v_rule from content.exam_rule_versions where paper_id = v_paper.id;

    if v_items = 0 then
      raise exception 'paper_has_no_items' using errcode = '22023';
    end if;
    if v_rule = 0 then
      raise exception 'rules_missing' using errcode = '22023';
    end if;
    if v_keyed < v_items then
      raise exception 'incomplete_key:%/%', v_keyed, v_items using errcode = '22023';
    end if;
  end if;

  update content.papers
     set status = p_status,
         published_at = case when p_status = 'published' then now() else published_at end
   where id = v_paper.id;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'exam_paper_status', 'paper', v_paper.id, jsonb_build_object('status', p_status));

  return jsonb_build_object('paper', p_paper_slug, 'status', p_status);
end;
$$;

/**
 * A key amendment appends a new key version: the previous one is copied and the given
 * items are replaced. Changes are addressed by paper position, so an editor never has to
 * know internal ids. Nothing about an existing result moves.
 */
create or replace function public.exam_admin_amend_key(
  p_actor uuid, p_paper_slug text, p_changes jsonb, p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_role public.admin_role;
  v_paper content.papers%rowtype;
  v_key uuid;
  v_version integer;
  v_change jsonb;
  v_item_version uuid;
  v_position integer;
begin
  v_role := public.admin_role_of(p_actor);
  if v_role is null then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) <> 'array' then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;

  select * into v_paper from content.papers where slug = p_paper_slug;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select id, version_number into v_key, v_version
    from content.exam_key_versions
   where paper_id = v_paper.id order by version_number desc limit 1;
  if v_key is null then
    raise exception 'key_missing' using errcode = '22023';
  end if;

  insert into content.exam_key_versions
    (paper_id, version_number, status, source_note, published_at, content_hash)
  values
    (v_paper.id, v_version + 1, case when p_publish then 'published' else 'draft' end,
     'amended by admin', case when p_publish then now() end, null)
  returning id into v_key;

  -- Copy every previous answer, then apply the amendments.
  insert into content.exam_key_items
    (paper_id, key_version_id, item_version_id, accepted_option_ids, correct_option_ids,
     accepted_numeric_intervals, exceptional_policy)
  select ki.paper_id, v_key, ki.item_version_id, ki.accepted_option_ids, ki.correct_option_ids,
         ki.accepted_numeric_intervals, ki.exceptional_policy
    from content.exam_key_items ki
   where ki.key_version_id = (
     select id from content.exam_key_versions
      where paper_id = v_paper.id order by version_number desc offset 1 limit 1
   );

  for v_change in select * from jsonb_array_elements(p_changes)
  loop
    v_position := (v_change ->> 'position')::int;
    select item_version_id into v_item_version
      from content.exam_paper_items
     where paper_id = v_paper.id and position = v_position;
    if v_item_version is null then
      raise exception 'unknown_position:%', v_position using errcode = '22023';
    end if;

    update content.exam_key_items
       set accepted_option_ids = coalesce(
             case when v_change ? 'accepted_option_ids'
                  then array(select jsonb_array_elements_text(v_change -> 'accepted_option_ids'))
             end, accepted_option_ids),
           correct_option_ids = coalesce(
             case when v_change ? 'correct_option_ids'
                  then array(select jsonb_array_elements_text(v_change -> 'correct_option_ids'))
             end, correct_option_ids),
           accepted_numeric_intervals = coalesce(v_change -> 'accepted_numeric_intervals', accepted_numeric_intervals),
           exceptional_policy = coalesce(v_change ->> 'exceptional_policy', exceptional_policy)
     where key_version_id = v_key and item_version_id = v_item_version;

    if not found then
      raise exception 'position_not_keyed:%', v_position using errcode = '22023';
    end if;
  end loop;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'exam_key_amend', 'paper', v_paper.id,
          jsonb_build_object('key_version', v_version + 1, 'changes', jsonb_array_length(p_changes)));

  return jsonb_build_object('paper', p_paper_slug, 'key_version', v_version + 1);
end;
$$;

/** Regrade against a chosen key version. Produces a new row; the original result is frozen. */
create or replace function public.exam_admin_regrade(
  p_actor uuid, p_attempt_id uuid, p_key_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_role public.admin_role;
  v_attempt public.exam_attempts%rowtype;
  v_rule content.exam_rule_versions%rowtype;
  v_result public.exam_results%rowtype;
  v_partial jsonb;
  v_total text := '0';
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  rec record;
  v_graded jsonb;
  v_key uuid;
begin
  v_role := public.admin_role_of(p_actor);
  if v_role is null then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into v_result from public.exam_results where attempt_id = p_attempt_id;
  if not found then
    raise exception 'not_submitted' using errcode = '22023';
  end if;

  v_key := coalesce(p_key_version_id, v_attempt.key_version_id);
  if v_key is null then
    raise exception 'key_missing' using errcode = '22023';
  end if;
  if not exists (
    select 1 from content.exam_key_versions k
     where k.id = v_key and k.paper_id = v_attempt.paper_id
  ) then
    raise exception 'key_not_for_paper' using errcode = '22023';
  end if;

  select * into v_rule from content.exam_rule_versions where id = v_attempt.rule_version_id;
  v_partial := coalesce(v_rule.marking -> 'partial', '{"policy":"none"}'::jsonb);

  for rec in
    select ai.id, ai.position, ai.item_type, ai.marking, ai.section_subject, r.response,
           ki.accepted_option_ids, ki.correct_option_ids, ki.accepted_numeric_intervals,
           ki.exceptional_policy
      from public.exam_attempt_items ai
      left join public.exam_responses r
        on r.attempt_id = ai.attempt_id and r.attempt_item_id = ai.id
      left join content.exam_key_items ki
        on ki.key_version_id = v_key and ki.item_version_id = ai.item_version_id
     where ai.attempt_id = p_attempt_id
     order by ai.position
  loop
    v_graded := public.exam_grade_item(
      rec.item_type, rec.marking, rec.response,
      jsonb_build_object(
        'accepted_option_ids', to_jsonb(rec.accepted_option_ids),
        'correct_option_ids', to_jsonb(rec.correct_option_ids),
        'accepted_numeric_intervals', rec.accepted_numeric_intervals,
        'exceptional_policy', rec.exceptional_policy),
      v_partial);
    v_total := public.exam_rational_add(v_total, v_graded ->> 'award');
    v_count := v_count + 1;
    v_items := v_items || jsonb_build_object(
      'position', rec.position, 'status', v_graded ->> 'status', 'award', v_graded ->> 'award');
  end loop;

  insert into public.exam_regrades
    (attempt_id, key_version_id, actor_id, total_exact, total_display, breakdown)
  values
    (p_attempt_id, v_key, p_actor, v_total,
     round(public.exam_rational_value(v_total), 2), v_items);

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'exam_regrade', 'attempt', p_attempt_id,
          jsonb_build_object('key_version_id', v_key, 'total', v_total));

  return jsonb_build_object(
    'attempt_id', p_attempt_id, 'key_version_id', v_key, 'total_exact', v_total, 'items', v_count);
end;
$$;

/** Submitted attempts for one paper, for the regrade list. */
create or replace function public.exam_admin_attempts(p_actor uuid, p_paper_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_role public.admin_role;
begin
  v_role := public.admin_role_of(p_actor);
  if v_role is null then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'attempt_id', a.id, 'submitted_at', a.submitted_at,
             'total_exact', r.total_exact,
             'regrades', (select count(*)::int from public.exam_regrades g where g.attempt_id = a.id)
           ) order by a.submitted_at desc)
      from public.exam_attempts a
      join content.papers p on p.id = a.paper_id
      join public.exam_results r on r.attempt_id = a.id
     where p.slug = p_paper_slug and a.state = 'submitted'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.exam_admin_papers(uuid) from public;
revoke all on function public.exam_admin_set_status(uuid, text, text) from public;
revoke all on function public.exam_admin_amend_key(uuid, text, jsonb, boolean) from public;
revoke all on function public.exam_admin_regrade(uuid, uuid, uuid) from public;
revoke all on function public.exam_admin_attempts(uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert on public.exam_regrades to service_role;
    grant execute on function public.exam_admin_papers(uuid) to service_role;
    grant execute on function public.exam_admin_set_status(uuid, text, text) to service_role;
    grant execute on function public.exam_admin_amend_key(uuid, text, jsonb, boolean) to service_role;
    grant execute on function public.exam_admin_regrade(uuid, uuid, uuid) to service_role;
    grant execute on function public.exam_admin_attempts(uuid, text) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.exam_regrades from anon;
  end if;
end
$$;
