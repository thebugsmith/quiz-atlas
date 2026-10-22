-- Study feedback: check an answer, reveal the explanation, keep a private note.
--
-- Correctness is only ever returned by these functions, never by the manifest, so a timed
-- paper cannot be peeked at. Study checks preserve the first unaided answer: the response
-- recorded when the player first asked for feedback is kept even if they change it later.

create table if not exists public.exam_notes (
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  attempt_item_id uuid not null references public.exam_attempt_items (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, attempt_item_id)
);

create table if not exists public.exam_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  paper_id uuid not null references content.papers (id) on delete cascade,
  question_id uuid references content.questions (id) on delete cascade,
  item_version_id uuid references content.exam_item_versions (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint exam_bookmarks_one_target check (num_nonnulls(question_id, item_version_id) = 1)
);

create unique index exam_bookmarks_target_idx
  on public.exam_bookmarks (user_id, coalesce(question_id, item_version_id));

alter table public.exam_notes enable row level security;
alter table public.exam_bookmarks enable row level security;

create policy exam_notes_select_own on public.exam_notes
  for select to authenticated using (
    exists (select 1 from public.exam_attempts a
             where a.id = exam_notes.attempt_id and a.owner_id = (select auth.uid()))
  );
create policy exam_bookmarks_select_own on public.exam_bookmarks
  for select to authenticated using (user_id = (select auth.uid()));

/** The answer and, when it exists, the explanation for one item. */
create or replace function public.exam_item_answer(p_attempt_id uuid, p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, content, pg_temp
as $$
  select jsonb_build_object(
           'accepted_option_ids', to_jsonb(ki.accepted_option_ids),
           'correct_option_ids', to_jsonb(ki.correct_option_ids),
           'accepted_numeric_intervals', ki.accepted_numeric_intervals,
           'exceptional_policy', ki.exceptional_policy,
           'explanation', coalesce(v.explanation, qv.explanation)
         )
    from public.exam_attempts a
    join public.exam_attempt_items ai on ai.id = p_item_id and ai.attempt_id = a.id
    left join content.exam_key_items ki
      on ki.key_version_id = a.key_version_id and ki.item_version_id = ai.item_version_id
    left join content.exam_item_versions v on v.id = ai.item_version_id
    left join content.question_versions qv on qv.id = (
      select q.current_version_id from content.questions q where q.id = ai.question_id
    )
   where a.id = p_attempt_id;
$$;

/** Check the current answer. Study only; a timed paper gives nothing away before submit. */
create or replace function public.exam_check_item(
  p_attempt_id uuid, p_owner uuid, p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_item public.exam_attempt_items%rowtype;
  v_response jsonb;
  v_answer jsonb;
  v_graded jsonb;
  v_rule content.exam_rule_versions%rowtype;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.mode <> 'study' or v_attempt.state <> 'active' then
    raise exception 'feedback_not_allowed' using errcode = '22023';
  end if;

  select * into v_item from public.exam_attempt_items
   where id = p_item_id and attempt_id = p_attempt_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select response into v_response from public.exam_responses
   where attempt_id = p_attempt_id and attempt_item_id = p_item_id;
  if v_response is null then
    raise exception 'no_response' using errcode = '22023';
  end if;

  select * into v_rule from content.exam_rule_versions where id = v_attempt.rule_version_id;
  v_answer := public.exam_item_answer(p_attempt_id, p_item_id);

  v_graded := public.exam_grade_item(
    v_item.item_type, v_item.marking, v_response,
    jsonb_build_object(
      'accepted_option_ids', v_answer -> 'accepted_option_ids',
      'correct_option_ids', v_answer -> 'correct_option_ids',
      'accepted_numeric_intervals', v_answer -> 'accepted_numeric_intervals',
      'exceptional_policy', v_answer -> 'exceptional_policy'
    ),
    coalesce(v_rule.marking -> 'partial', '{"policy":"none"}'::jsonb)
  );

  -- First unaided answer: kept once, never overwritten by a later edit.
  insert into public.exam_responses (attempt_id, attempt_item_id, visited, first_unaided, checked_at, updated_at)
  values (p_attempt_id, p_item_id, true, v_response, now(), now())
  on conflict (attempt_id, attempt_item_id) do update set
    first_unaided = coalesce(public.exam_responses.first_unaided, v_response),
    checked_at = coalesce(public.exam_responses.checked_at, now()),
    updated_at = now();

  return jsonb_build_object(
    'item_id', p_item_id,
    'status', v_graded ->> 'status',
    'award', v_graded ->> 'award',
    'correct_answer', jsonb_build_object(
      'accepted_option_ids', v_answer -> 'accepted_option_ids',
      'correct_option_ids', v_answer -> 'correct_option_ids',
      'accepted_numeric_intervals', v_answer -> 'accepted_numeric_intervals',
      'exceptional_policy', v_answer -> 'exceptional_policy'
    ),
    'explanation', v_answer ->> 'explanation',
    'editorial_note', 'The explanation is editorial unless the source paper printed one.'
  );
end;
$$;

/** Show the explanation without grading. Records that the item was reviewed. */
create or replace function public.exam_reveal_item(
  p_attempt_id uuid, p_owner uuid, p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_answer jsonb;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.mode <> 'study' or v_attempt.state <> 'active' then
    raise exception 'feedback_not_allowed' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.exam_attempt_items where id = p_item_id and attempt_id = p_attempt_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.exam_responses (attempt_id, attempt_item_id, visited, revealed_at, updated_at)
  values (p_attempt_id, p_item_id, true, now(), now())
  on conflict (attempt_id, attempt_item_id) do update set
    revealed_at = coalesce(public.exam_responses.revealed_at, now()),
    updated_at = now();

  v_answer := public.exam_item_answer(p_attempt_id, p_item_id);
  return jsonb_build_object('item_id', p_item_id, 'explanation', v_answer ->> 'explanation');
end;
$$;

create or replace function public.exam_note_set(
  p_attempt_id uuid, p_owner uuid, p_item_id uuid, p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
begin
  if not exists (
    select 1 from public.exam_attempts a
     where a.id = p_attempt_id and a.owner_id = p_owner and a.state = 'active'
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.exam_attempt_items where id = p_item_id and attempt_id = p_attempt_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_body is null or btrim(p_body) = '' then
    delete from public.exam_notes where attempt_id = p_attempt_id and attempt_item_id = p_item_id;
    return jsonb_build_object('item_id', p_item_id, 'note', null);
  end if;

  insert into public.exam_notes (attempt_id, attempt_item_id, body, updated_at)
  values (p_attempt_id, p_item_id, left(p_body, 4000), now())
  on conflict (attempt_id, attempt_item_id) do update set
    body = excluded.body, updated_at = now();

  return jsonb_build_object('item_id', p_item_id, 'note', left(p_body, 4000));
end;
$$;

create or replace function public.exam_note_list(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, content, pg_temp
as $$
begin
  if not exists (
    select 1 from public.exam_attempts a where a.id = p_attempt_id and a.owner_id = p_owner
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_object_agg(n.attempt_item_id, n.body)
      from public.exam_notes n where n.attempt_id = p_attempt_id
  ), '{}'::jsonb);
end;
$$;

/** Bookmark the underlying question or typed item, not the attempt: it outlives a retake. */
create or replace function public.exam_bookmark_toggle(
  p_owner uuid, p_attempt_id uuid, p_item_id uuid, p_on boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_item public.exam_attempt_items%rowtype;
  v_paper uuid;
  v_on boolean;
begin
  select * into v_item from public.exam_attempt_items
   where id = p_item_id and attempt_id = p_attempt_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select paper_id into v_paper from public.exam_attempts
   where id = p_attempt_id and owner_id = p_owner;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not p_on then
    delete from public.exam_bookmarks
     where user_id = p_owner and paper_id = v_paper
       and coalesce(question_id, item_version_id) = coalesce(v_item.question_id, v_item.item_version_id);
    return jsonb_build_object('item_id', p_item_id, 'bookmarked', false);
  end if;

  if v_item.question_id is not null then
    insert into public.exam_bookmarks (user_id, paper_id, question_id)
    values (p_owner, v_paper, v_item.question_id)
    on conflict do nothing;
  else
    insert into public.exam_bookmarks (user_id, paper_id, item_version_id)
    values (p_owner, v_paper, v_item.item_version_id)
    on conflict do nothing;
  end if;

  select true into v_on;
  return jsonb_build_object('item_id', p_item_id, 'bookmarked', v_on);
end;
$$;

revoke all on function public.exam_check_item(uuid, uuid, uuid) from public;
revoke all on function public.exam_reveal_item(uuid, uuid, uuid) from public;
revoke all on function public.exam_note_set(uuid, uuid, uuid, text) from public;
revoke all on function public.exam_note_list(uuid, uuid) from public;
revoke all on function public.exam_bookmark_toggle(uuid, uuid, uuid, boolean) from public;
revoke all on function public.exam_item_answer(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.exam_notes, public.exam_bookmarks to service_role;
    grant execute on function public.exam_check_item(uuid, uuid, uuid) to service_role;
    grant execute on function public.exam_reveal_item(uuid, uuid, uuid) to service_role;
    grant execute on function public.exam_note_set(uuid, uuid, uuid, text) to service_role;
    grant execute on function public.exam_note_list(uuid, uuid) to service_role;
    grant execute on function public.exam_bookmark_toggle(uuid, uuid, uuid, boolean) to service_role;
    grant execute on function public.exam_item_answer(uuid, uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.exam_notes, public.exam_bookmarks from anon;
    revoke all on function public.exam_check_item(uuid, uuid, uuid) from anon;
    revoke all on function public.exam_reveal_item(uuid, uuid, uuid) from anon;
    revoke all on function public.exam_note_set(uuid, uuid, uuid, text) from anon;
    revoke all on function public.exam_note_list(uuid, uuid) from anon;
    revoke all on function public.exam_bookmark_toggle(uuid, uuid, uuid, boolean) from anon;
    revoke all on function public.exam_item_answer(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.exam_check_item(uuid, uuid, uuid) from authenticated;
    revoke all on function public.exam_reveal_item(uuid, uuid, uuid) from authenticated;
    revoke all on function public.exam_note_set(uuid, uuid, uuid, text) from authenticated;
    revoke all on function public.exam_note_list(uuid, uuid) from authenticated;
    revoke all on function public.exam_bookmark_toggle(uuid, uuid, uuid, boolean) from authenticated;
    revoke all on function public.exam_item_answer(uuid, uuid) from authenticated;
  end if;
end
$$;
