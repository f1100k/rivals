create or replace function public.try_matchmake_gk()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gks int;
  v_out int;
  v_match uuid;
begin
  select count(*) into v_gks
  from (
    select user_id from public.queue
    where position = 'Goleiro'
    order by joined_at
    limit 2
    for update
  ) g;
  if v_gks < 2 then
    return;
  end if;

  select count(*) into v_out
  from (
    select user_id from public.queue
    where position is not null and position <> 'Goleiro'
    order by joined_at
    limit 8
    for update
  ) o;
  if v_out < 8 then
    return;
  end if;

  insert into public.matches (mode, region, status)
  values (5, 'SA', 'draft')
  returning id into v_match;

  insert into public.match_players (match_id, user_id, team, position, rating_before)
  select v_match, g.user_id, case g.rn when 1 then 'a' else 'b' end, 'Goleiro', pr.rating
  from (
    select user_id, row_number() over (order by locked.joined_at) as rn
    from (
      select user_id, joined_at from public.queue where position = 'Goleiro' order by joined_at limit 2 for update
    ) locked
  ) g
  join public.profiles pr on pr.id = g.user_id;

  insert into public.match_players (match_id, user_id, team, position, rating_before)
  select v_match, o.user_id, null, o.position, pr.rating
  from (
    select user_id, position from public.queue
    where position is not null and position <> 'Goleiro'
    order by joined_at
    limit 8
    for update
  ) o
  join public.profiles pr on pr.id = o.user_id;

  delete from public.queue
  where user_id in (select user_id from public.match_players where match_id = v_match);
end;
$$;