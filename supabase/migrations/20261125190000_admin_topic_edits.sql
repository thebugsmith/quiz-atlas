-- The admin list called a question a draft when its live version was not the newest row
-- of the whole question, which every question with a second locale trips over. A draft
-- only makes sense within the same locale. Same reason the save path reported a
-- topic-only edit as unchanged: the fingerprint covers the body, not the classification.

CREATE OR REPLACE FUNCTION public.admin_question_save(p_actor uuid, p_question_id uuid, p_external_id text, p_topic_slug text, p_difficulty text, p_question_type text, p_stem text, p_statements text[], p_prompt text, p_options jsonb, p_correct_option_id integer, p_explanation text, p_content_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- Classification is not part of the body fingerprint, so an edit that only moves a
    -- question between topics still has to produce a version.
    if v_current.content_hash = v_hash
       and v_current.topic_id = v_topic_id
       and v_current.difficulty = p_difficulty::content.difficulty
       and v_current.question_type = p_question_type::content.question_type then
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
$function$
;
CREATE OR REPLACE FUNCTION public.admin_question_search(p_actor uuid, p_query text DEFAULT NULL::text, p_topic_slug text DEFAULT NULL::text, p_difficulty text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_state text DEFAULT 'live'::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
             and (cv.id is null or (v.version_number > cv.version_number and v.locale = cv.locale))
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
$function$
;