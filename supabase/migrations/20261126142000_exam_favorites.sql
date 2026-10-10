-- Favorites, by paper slug: the library never exposes a paper id it has not resolved
-- itself, and the write path re-checks ownership in one place.
create or replace function public.exam_favorites_list(p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, content, pg_temp
as $$
  select coalesce(jsonb_agg(p.slug order by f.created_at desc), '[]'::jsonb)
    from public.exam_favorites f
    join content.papers p on p.id = f.paper_id
   where f.user_id = p_owner;
$$;

create or replace function public.exam_set_favorite(p_owner uuid, p_slug text, p_favorite boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_paper uuid;
begin
  if not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select id into v_paper from content.papers where slug = p_slug and status <> 'archived';
  if v_paper is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_favorite then
    insert into public.exam_favorites (user_id, paper_id)
    values (p_owner, v_paper)
    on conflict do nothing;
  else
    delete from public.exam_favorites where user_id = p_owner and paper_id = v_paper;
  end if;

  return jsonb_build_object('paper', p_slug, 'favorite', p_favorite);
end;
$$;

revoke all on function public.exam_favorites_list(uuid) from public;
revoke all on function public.exam_set_favorite(uuid, text, boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_favorites_list(uuid) to service_role;
    grant execute on function public.exam_set_favorite(uuid, text, boolean) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.exam_favorites_list(uuid) from anon;
    revoke all on function public.exam_set_favorite(uuid, text, boolean) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.exam_favorites_list(uuid) from authenticated;
    revoke all on function public.exam_set_favorite(uuid, text, boolean) from authenticated;
  end if;
end
$$;
