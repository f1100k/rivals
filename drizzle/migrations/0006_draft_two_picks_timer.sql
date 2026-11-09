create or replace function public.draft_turn(p_match uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when ((count(*) / 2) % 2) = 0 then 'a' else 'b' end
  from match_players where match_id = p_match and team is not null and position <> 'Goleiro';
$$;

create or replace function public.draft_assign(p_match uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update match_players set team = draft_turn(p_match)
  where match_id = p_match and user_id = p_target and team is null;
  if not exists (select 1 from match_players where match_id = p_match and team is null) then
    update matches set status = 'room', deadline = null where id = p_match and status = 'draft';
    return;
  end if;
  select count(*) into v_n from match_players where match_id = p_match and team is not null and position <> 'Goleiro';
  if v_n % 2 = 0 then
    update matches set deadline = now() + interval '30 seconds' where id = p_match;
  end if;
end $$;

create or replace function public.ghost_autopick(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_target uuid;
begin
  loop
    exit when not exists (select 1 from match_players where match_id = p_match and team is null);
    exit when not exists (
      select 1 from match_players mp join profiles p on p.id = mp.user_id
      where mp.match_id = p_match and mp.team = draft_turn(p_match) and mp.position = 'Goleiro' and p.is_ghost);
    select user_id into v_target from match_players
      where match_id = p_match and team is null order by rating_before desc limit 1;
    perform draft_assign(p_match, v_target);
  end loop;
end $$;

create or replace function public.draft_tick(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_n int; v_left int; v_target uuid; i int;
begin
  perform 1 from matches where id = p_match and status = 'draft' and deadline < now() for update;
  if found then
    select count(*) into v_n from match_players where match_id = p_match and team is not null and position <> 'Goleiro';
    v_left := 2 - (v_n % 2);
    for i in 1..v_left loop
      select user_id into v_target from match_players where match_id = p_match and team is null order by random() limit 1;
      exit when v_target is null;
      perform draft_assign(p_match, v_target);
      v_target := null;
    end loop;
  end if;
  perform ghost_autopick(p_match);
end $$;
revoke execute on function public.draft_turn(uuid), public.draft_assign(uuid, uuid), public.draft_tick(uuid), public.ghost_autopick(uuid) from public, anon, authenticated;

create or replace function public.draft_tick_gk() returns json
language plpgsql security definer set search_path = public as $$
declare v_match uuid; v_deadline timestamptz; v_status text; v_n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select m.id into v_match from match_players mp join matches m on m.id = mp.match_id
  where mp.user_id = auth.uid() and m.status = 'draft' limit 1;
  if v_match is null then return null; end if;
  perform draft_tick(v_match);
  select deadline, status into v_deadline, v_status from matches where id = v_match;
  select count(*) into v_n from match_players where match_id = v_match and team is not null and position <> 'Goleiro';
  return json_build_object('deadline', v_deadline, 'turn', draft_turn(v_match), 'picksLeft', 2 - (v_n % 2));
end $$;
grant execute on function public.draft_tick_gk() to authenticated;

create or replace function public.draft_pick(p_target uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_match uuid; v_my_team text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select mp.match_id, mp.team into v_match, v_my_team
  from match_players mp join matches m on m.id = mp.match_id
  where mp.user_id = v_uid and mp.position = 'Goleiro' and m.status = 'draft' limit 1;
  if v_match is null then raise exception 'sem_partida_em_escolha'; end if;
  perform draft_tick(v_match);
  if not exists (select 1 from matches where id = v_match and status = 'draft') then return true; end if;
  if v_my_team is distinct from draft_turn(v_match) then raise exception 'nao_e_sua_vez'; end if;
  if not exists (select 1 from match_players where match_id = v_match and user_id = p_target and team is null) then
    raise exception 'jogador_indisponivel'; end if;
  perform draft_assign(v_match, p_target);
  perform ghost_autopick(v_match);
  return true;
end $$;

create or replace function public.ghost_draft_stmt_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct n.match_id from new_rows n join matches m on m.id = n.match_id
           where m.status = 'draft' and n.team is null loop
    update matches set deadline = now() + interval '30 seconds' where id = r.match_id;
    perform ghost_autopick(r.match_id);
  end loop;
  return null;
end $$;