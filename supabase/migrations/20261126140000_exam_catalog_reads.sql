-- Catalog reads and favorites for the exam library.
--
-- The bank is in the private `content` schema, so the browser cannot query it and these
-- functions are the only way a page sees a paper. They return constructed objects: no
-- key, no item text, nothing that a player is not allowed to see before starting.

create or replace function public.exam_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public, content, pg_temp
as $$
  with paper_rows as (
    select
      p.id,
      p.slug,
      p.year,
      p.paper_code,
      p.paper_label,
      p.session_label,
      p.shift_label,
      p.administration,
      p.status,
      p.source_status,
      p.supported_types,
      p.question_count,
      p.duration_seconds,
      p.marks_correct,
      p.marks_wrong,
      p.max_marks,
      e.slug as exam_slug,
      e.name as exam_name,
      e.id as exam_id,
      ed.code as edition_code,
      ed.label as edition_label,
      st.code as stage_code,
      st.name as stage_name,
      (select count(*)::int from content.exam_key_versions k
        where k.paper_id = p.id and k.status = 'published') as published_keys,
      (select count(*)::int from content.paper_locales l where l.paper_id = p.id) as locale_rows,
      (select coalesce(array_agg(l.locale order by l.locale), '{}')
         from content.paper_locales l
        where l.paper_id = p.id and l.status in ('reviewed', 'official')) as reviewed_locales
    from content.papers p
    join content.exams e on e.id = p.exam_id
    left join content.exam_editions ed on ed.id = p.edition_id
    left join content.exam_stages st on st.id = p.stage_id
    where p.status <> 'archived'
  )
  select coalesce(jsonb_agg(exam order by exam ->> 'sort_order', exam ->> 'name'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'slug', e.slug,
        'name', e.name,
        'family', e.family,
        'sort_order', e.sort_order,
        'authority', a.name,
        'editions', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'code', ed.code, 'label', ed.label,
                   'held_from', ed.held_from, 'held_to', ed.held_to
                 ) order by ed.code desc)
            from content.exam_editions ed where ed.exam_id = e.id
        ), '[]'::jsonb),
        'papers', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'slug', pr.slug,
                   'year', pr.year,
                   'paper_code', pr.paper_code,
                   'paper_label', pr.paper_label,
                   'session_label', pr.session_label,
                   'shift_label', pr.shift_label,
                   'administration', pr.administration,
                   'status', pr.status,
                   'source_status', pr.source_status,
                   'supported_types', pr.supported_types,
                   'question_count', pr.question_count,
                   'duration_seconds', pr.duration_seconds,
                   'marks_correct', pr.marks_correct,
                   'marks_wrong', pr.marks_wrong,
                   'max_marks', pr.max_marks,
                   'edition', pr.edition_label,
                   'edition_code', pr.edition_code,
                   'stage', pr.stage_name,
                   'key_status', case when pr.published_keys > 0 then 'published' else 'missing' end,
                   'locales', pr.reviewed_locales
                 ) order by pr.year desc, pr.paper_code, pr.shift_label)
            from paper_rows pr where pr.exam_id = e.id
        ), '[]'::jsonb)
      ) as exam
      from content.exams e
      left join content.exam_authorities a on a.id = e.authority_id
      where e.is_active
    ) exams;
$$;

create or replace function public.exam_paper_detail(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, content, pg_temp
as $$
  select jsonb_build_object(
    'slug', p.slug,
    'year', p.year,
    'paper_code', p.paper_code,
    'paper_label', p.paper_label,
    'shift_label', p.shift_label,
    'session_label', p.session_label,
    'exam_date', p.exam_date,
    'administration', p.administration,
    'status', p.status,
    'source_status', p.source_status,
    'supported_types', p.supported_types,
    'question_count', p.question_count,
    'duration_seconds', p.duration_seconds,
    'marks_correct', p.marks_correct,
    'marks_wrong', p.marks_wrong,
    'max_marks', p.max_marks,
    'exam', jsonb_build_object('slug', e.slug, 'name', e.name, 'family', e.family),
    'authority', a.name,
    'edition', case when ed.id is null then null
                    else jsonb_build_object('code', ed.code, 'label', ed.label) end,
    'stage', case when st.id is null then null
                  else jsonb_build_object('code', st.code, 'name', st.name) end,
    'key_status', case
      when exists (select 1 from content.exam_key_versions k
                    where k.paper_id = p.id and k.status = 'published') then 'published'
      when exists (select 1 from content.exam_key_versions k
                    where k.paper_id = p.id) then 'draft'
      when exists (select 1 from content.paper_questions pq where pq.paper_id = p.id) then 'embedded'
      else 'missing' end,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subject', s.subject, 'position', s.position,
               'items', (select count(*)::int from content.paper_manifest_items mi
                          where mi.paper_id = p.id and mi.section_id = s.id)
             ) order by s.position)
        from content.paper_sections s where s.paper_id = p.id
    ), '[]'::jsonb),
    'items', (select count(*)::int from content.paper_manifest_items mi where mi.paper_id = p.id),
    'locales', coalesce((
      select jsonb_agg(jsonb_build_object('locale', l.locale, 'status', l.status) order by l.locale)
        from content.paper_locales l where l.paper_id = p.id
    ), '[]'::jsonb),
    'rule', (
      select jsonb_build_object(
               'timing', r.timing, 'marking', r.marking, 'navigation', r.navigation,
               'choices', r.choices, 'display', r.display, 'status', r.status,
               'version', r.version_number
             )
        from content.exam_rule_versions r
       where r.paper_id = p.id
       order by (r.status = 'published') desc, r.version_number desc
       limit 1
    )
  )
  from content.papers p
  join content.exams e on e.id = p.exam_id
  left join content.exam_authorities a on a.id = e.authority_id
  left join content.exam_editions ed on ed.id = p.edition_id
  left join content.exam_stages st on st.id = p.stage_id
  where p.slug = p_slug and p.status <> 'archived';
$$;

revoke all on function public.exam_catalog() from public;
revoke all on function public.exam_paper_detail(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_catalog() to service_role;
    grant execute on function public.exam_paper_detail(text) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.exam_catalog() from anon;
    revoke all on function public.exam_paper_detail(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.exam_catalog() from authenticated;
    revoke all on function public.exam_paper_detail(text) from authenticated;
  end if;
end
$$;

-- Favorites are private to the player and only decide what the library shows first.
create table if not exists public.exam_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  paper_id uuid not null references content.papers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

alter table public.exam_favorites enable row level security;

create policy exam_favorites_select_own on public.exam_favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy exam_favorites_insert_own on public.exam_favorites
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy exam_favorites_delete_own on public.exam_favorites
  for delete to authenticated using (user_id = (select auth.uid()));
