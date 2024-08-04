-- Content management for trusted editors.
--
-- Roles live in public.admin_users and are granted only by a trusted command
-- (`pnpm admin:grant`), never through an endpoint. Every function below re-checks the
-- caller's role itself, so a direct PostgREST call from a player's session fails even
-- if the route in front of it were wrong.
--
-- Published versions stay immutable: an edit always inserts a new version and
-- `publish` only moves the pointer on content.questions.

create or replace function public.admin_role_of(p_actor uuid)
returns public.admin_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.admin_users where user_id = p_actor;
$$;

revoke all on function public.admin_role_of(uuid) from public;

-- Raised message set every endpoint maps to 403.
create or replace function public.admin_require(p_actor uuid)
returns public.admin_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.admin_role;
begin
  select role into v_role from public.admin_users where user_id = p_actor;
  if v_role is null then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

revoke all on function public.admin_require(uuid) from public;

-- Inventory per topic: what a player can actually be dealt, how much is waiting in
-- drafts, and which topics are too thin to fill a quiz.
create or replace function public.admin_inventory(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
begin
  perform public.admin_require(p_actor);

  select coalesce(jsonb_agg(row order by row ->> 'name'), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
               'slug', t.slug,
               'name', t.name,
               'is_active', t.is_active,
               'live', count(q.id) filter (
                 where q.archived_at is null and q.current_version_id is not null
               ),
               'drafts', count(q.id) filter (
                 where q.archived_at is null
                   and (q.current_version_id is null or exists (
                     select 1
                       from content.question_versions dv
                       join content.question_versions cv on cv.id = q.current_version_id
                      where dv.question_id = q.id and dv.version_number > cv.version_number
                   ))
               ),
               'archived', count(q.id) filter (where q.archived_at is not null)
             ) as row
        from content.topics t
        left join content.question_versions v on v.topic_id = t.id
        left join content.questions q on q.id = v.question_id
       group by t.slug, t.name, t.is_active
    ) rows;

  return jsonb_build_object(
    'topics', v_rows,
    'low_inventory', (
      select coalesce(jsonb_agg(slug), '[]'::jsonb)
        from jsonb_to_recordset(v_rows) as x(slug text, name text, live bigint)
       where x.live < 5
    )
  );
end;
$$;

revoke all on function public.admin_inventory(uuid) from public;

create or replace function public.admin_question_search(
  p_actor uuid,
  p_query text default null,
  p_topic_slug text default null,
  p_difficulty text default null,
  p_type text default null,
  p_state text default 'live',
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
begin
  perform public.admin_require(p_actor);

  select coalesce(jsonb_agg(row order by row ->> 'updated_at' desc), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
               'question_id', q.id,
               'external_id', q.external_id,
               'prompt', coalesce(cv.prompt, dv.prompt),
               'topic_slug', t.slug,
               'topic_name', t.name,
               'difficulty', coalesce(cv.difficulty, dv.difficulty)::text,
               'question_type', coalesce(cv.question_type, dv.question_type)::text,
               'state', case
                 when q.archived_at is not null then 'archived'
                 when q.current_version_id is null then 'draft'
                 when dv.id is not null then 'draft'
                 else 'live'
               end,
               'has_draft', dv.id is not null,
               'version_count', (select count(*) from content.question_versions v where v.question_id = q.id),
               'updated_at', q.updated_at
             ) as row
        from content.questions q
        left join content.question_versions cv on cv.id = q.current_version_id
        left join lateral (
          select v.*
            from content.question_versions v
           where v.question_id = q.id
             and (cv.id is null or v.version_number > cv.version_number)
           order by v.version_number desc
           limit 1
        ) dv on true
        join content.topics t on t.id = coalesce(cv.topic_id, dv.topic_id)
       where (p_query is null or p_query = ''
              or coalesce(cv.prompt, dv.prompt, '') ilike '%' || p_query || '%'
              or q.external_id ilike '%' || p_query || '%')
         and (p_topic_slug is null or p_topic_slug = '' or t.slug = p_topic_slug)
         and (p_difficulty is null or p_difficulty = '' or coalesce(cv.difficulty, dv.difficulty)::text = p_difficulty)
         and (p_type is null or p_type = '' or coalesce(cv.question_type, dv.question_type)::text = p_type)
         and (p_state is null or p_state = 'all'
              or (p_state = 'live' and q.archived_at is null and q.current_version_id is not null and dv.id is null)
              or (p_state = 'draft' and q.archived_at is null and (q.current_version_id is null or dv.id is not null))
              or (p_state = 'archived' and q.archived_at is not null))
       order by q.updated_at desc
       limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) rows;

  return jsonb_build_object('questions', v_rows);
end;
$$;

revoke all on function public.admin_question_search(uuid, text, text, text, text, text, integer) from public;

create or replace function public.admin_question_detail(p_actor uuid, p_question_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_question content.questions%rowtype;
  v_current jsonb;
  v_draft jsonb;
begin
  perform public.admin_require(p_actor);

  select * into v_question from content.questions where id = p_question_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select to_jsonb(v) || jsonb_build_object('topic_slug', t.slug, 'topic_name', t.name)
    into v_current
    from content.question_versions v
    join content.topics t on t.id = v.topic_id
   where v.id = v_question.current_version_id;

  select to_jsonb(v) || jsonb_build_object('topic_slug', t.slug, 'topic_name', t.name)
    into v_draft
    from content.question_versions v
    join content.topics t on t.id = v.topic_id
   where v.question_id = v_question.id
     and (
       v_question.current_version_id is null
       or v.version_number > (select version_number from content.question_versions where id = v_question.current_version_id)
     )
   order by v.version_number desc
   limit 1;

  return jsonb_build_object(
    'question_id', v_question.id,
    'external_id', v_question.external_id,
    'archived_at', v_question.archived_at,
    'current', v_current,
    'draft', v_draft
  );
end;
$$;

revoke all on function public.admin_question_detail(uuid, uuid) from public;

-- One write path for both the editor and the importer. It never updates a version;
-- it appends the next one, so history is preserved by construction.
create or replace function public.admin_question_save(
  p_actor uuid,
  p_question_id uuid,
  p_external_id text,
  p_topic_slug text,
  p_difficulty text,
  p_question_type text,
  p_stem text,
  p_statements text[],
  p_prompt text,
  p_options jsonb,
  p_correct_option_id integer,
  p_explanation text,
  p_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_question content.questions%rowtype;
  v_topic_id uuid;
  v_current content.question_versions%rowtype;
  v_next integer;
  v_hash text;
  v_version_id uuid;
  v_unchanged boolean := false;
begin
  perform public.admin_require(p_actor);

  select id into v_topic_id from content.topics where slug = p_topic_slug;
  if v_topic_id is null then
    raise exception 'topic_not_found' using errcode = 'P0002';
  end if;

  if not content.options_are_valid(p_options, p_correct_option_id) then
    raise exception 'invalid_options' using errcode = '22023';
  end if;

  if p_question_type not in ('mcq', 'comprehension') then
    raise exception 'invalid_question_type' using errcode = '22023';
  end if;
  if p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'invalid_difficulty' using errcode = '22023';
  end if;

  -- The fingerprint is computed by the shared TypeScript helper and passed in, so an
  -- editor save and a file import of the same body produce the same hash.
  if p_content_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_content_hash' using errcode = '22023';
  end if;
  v_hash := p_content_hash;

  if p_question_id is not null then
    select * into v_question from content.questions where id = p_question_id for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  else
    select * into v_question from content.questions where external_id = p_external_id for update;
    if not found then
      insert into content.questions (external_id) values (p_external_id) returning * into v_question;
    end if;
  end if;

  if v_question.current_version_id is not null then
    select * into v_current from content.question_versions where id = v_question.current_version_id;
    if v_current.content_hash = v_hash then
      return jsonb_build_object(
        'question_id', v_question.id, 'version_id', v_current.id,
        'version_number', v_current.version_number, 'unchanged', true
      );
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from content.question_versions where question_id = v_question.id;

  insert into content.question_versions (
    question_id, version_number, topic_id, difficulty, question_type,
    stem, statements, prompt, options, correct_option_id, explanation, content_hash
  ) values (
    v_question.id, v_next, v_topic_id, p_difficulty::content.difficulty, p_question_type::content.question_type,
    nullif(btrim(coalesce(p_stem, '')), ''), coalesce(p_statements, '{}'), p_prompt, p_options,
    p_correct_option_id, nullif(btrim(coalesce(p_explanation, '')), ''), v_hash
  ) returning id into v_version_id;

  update content.questions set updated_at = now() where id = v_question.id;

  return jsonb_build_object(
    'question_id', v_question.id, 'version_id', v_version_id,
    'version_number', v_next, 'unchanged', v_unchanged
  );
end;
$$;

revoke all on function public.admin_question_save(uuid, uuid, text, text, text, text, text, text[], text, jsonb, integer, text, text) from public;

create or replace function public.admin_question_publish(p_actor uuid, p_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_latest content.question_versions%rowtype;
  v_archived timestamptz;
begin
  perform public.admin_require(p_actor);

  select archived_at into v_archived from content.questions where id = p_question_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_archived is not null then
    raise exception 'question_archived' using errcode = 'P0001';
  end if;

  select * into v_latest
    from content.question_versions
   where question_id = p_question_id
   order by version_number desc
   limit 1;

  if not found then
    raise exception 'nothing_to_publish' using errcode = 'P0001';
  end if;

  update content.questions
     set current_version_id = v_latest.id,
         updated_at = now()
   where id = p_question_id;

  return jsonb_build_object(
    'question_id', p_question_id, 'published_version_id', v_latest.id,
    'version_number', v_latest.version_number
  );
end;
$$;

revoke all on function public.admin_question_publish(uuid, uuid) from public;

create or replace function public.admin_question_archive(
  p_actor uuid, p_question_id uuid, p_archived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_require(p_actor);

  update content.questions
     set archived_at = case when p_archived then now() else null end,
         updated_at = now()
   where id = p_question_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('question_id', p_question_id, 'archived', p_archived);
end;
$$;

revoke all on function public.admin_question_archive(uuid, uuid, boolean) from public;

create or replace function public.admin_topic_save(
  p_actor uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.admin_require(p_actor);

  insert into content.topics (slug, name, description, is_active, sort_order)
  values (p_slug, p_name, coalesce(p_description, ''), coalesce(p_is_active, true), coalesce(p_sort_order, 0))
  on conflict (slug) do update
    set name = excluded.name,
        description = excluded.description,
        is_active = excluded.is_active,
        sort_order = excluded.sort_order,
        updated_at = now()
  returning id into v_id;

  return jsonb_build_object('topic_id', v_id, 'slug', p_slug);
end;
$$;

revoke all on function public.admin_topic_save(uuid, text, text, text, boolean, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.admin_role_of(uuid) to service_role;
    grant execute on function public.admin_require(uuid) to service_role;
    grant execute on function public.admin_inventory(uuid) to service_role;
    grant execute on function public.admin_question_search(uuid, text, text, text, text, text, integer) to service_role;
    grant execute on function public.admin_question_detail(uuid, uuid) to service_role;
    grant execute on function public.admin_question_save(uuid, uuid, text, text, text, text, text, text[], text, jsonb, integer, text, text) to service_role;
    grant execute on function public.admin_question_publish(uuid, uuid) to service_role;
    grant execute on function public.admin_question_archive(uuid, uuid, boolean) to service_role;
    grant execute on function public.admin_topic_save(uuid, text, text, text, boolean, integer) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.admin_role_of(uuid) from anon;
    revoke all on function public.admin_require(uuid) from anon;
    revoke all on function public.admin_inventory(uuid) from anon;
    revoke all on function public.admin_question_search(uuid, text, text, text, text, text, integer) from anon;
    revoke all on function public.admin_question_detail(uuid, uuid) from anon;
    revoke all on function public.admin_question_save(uuid, uuid, text, text, text, text, text, text[], text, jsonb, integer, text, text) from anon;
    revoke all on function public.admin_question_publish(uuid, uuid) from anon;
    revoke all on function public.admin_question_archive(uuid, uuid, boolean) from anon;
    revoke all on function public.admin_topic_save(uuid, text, text, text, boolean, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.admin_role_of(uuid) from authenticated;
    revoke all on function public.admin_require(uuid) from authenticated;
    revoke all on function public.admin_inventory(uuid) from authenticated;
    revoke all on function public.admin_question_search(uuid, text, text, text, text, text, integer) from authenticated;
    revoke all on function public.admin_question_detail(uuid, uuid) from authenticated;
    revoke all on function public.admin_question_save(uuid, uuid, text, text, text, text, text, text[], text, jsonb, integer, text, text) from authenticated;
    revoke all on function public.admin_question_publish(uuid, uuid) from authenticated;
    revoke all on function public.admin_question_archive(uuid, uuid, boolean) from authenticated;
    revoke all on function public.admin_topic_save(uuid, text, text, text, boolean, integer) from authenticated;
  end if;
end
$$;
