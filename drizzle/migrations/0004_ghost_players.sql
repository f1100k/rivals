alter table public.profiles add column if not exists is_ghost boolean not null default false;

create or replace function public.ghost_autopick(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_turn text; v_target uuid;
begin
  loop
    exit when not exists (select 1 from match_players where match_id = p_match and team is null);
    select case when count(*) filter (where team='a') <= count(*) filter (where team='b') then 'a' else 'b' end
      into v_turn from match_players where match_id = p_match;
    exit when not exists (
      select 1 from match_players mp join profiles p on p.id = mp.user_id
      where mp.match_id = p_match and mp.team = v_turn and mp.position = 'Goleiro' and p.is_ghost);
    select user_id into v_target from match_players
      where match_id = p_match and team is null order by rating_before desc limit 1;
    update match_players set team = v_turn where match_id = p_match and user_id = v_target;
  end loop;
  if not exists (select 1 from match_players where match_id = p_match and team is null) then
    update matches set status = 'room' where id = p_match and status = 'draft';
  end if;
end $$;
revoke execute on function public.ghost_autopick(uuid) from public, anon, authenticated;

create or replace function public.draft_pick(p_target uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_match uuid; v_my_team text; v_turn text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select mp.match_id, mp.team into v_match, v_my_team
  from match_players mp join matches m on m.id = mp.match_id
  where mp.user_id = v_uid and mp.position = 'Goleiro' and m.status = 'draft' limit 1;
  if v_match is null then raise exception 'sem_partida_em_escolha'; end if;
  select case when count(*) filter (where team='a') <= count(*) filter (where team='b') then 'a' else 'b' end
    into v_turn from match_players where match_id = v_match;
  if v_my_team is distinct from v_turn then raise exception 'nao_e_sua_vez'; end if;
  if not exists (select 1 from match_players where match_id = v_match and user_id = p_target and team is null) then
    raise exception 'jogador_indisponivel'; end if;
  update match_players set team = v_turn where match_id = v_match and user_id = p_target;
  perform ghost_autopick(v_match);
  if not exists (select 1 from match_players where match_id = v_match and team is null) then
    update matches set status = 'room' where id = v_match and status = 'draft';
  end if;
  return true;
end $$;

create or replace function public.ghost_autopick_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'draft' then perform ghost_autopick(new.id); end if;
  return null;
end $$;

create or replace function public.ghost_vote_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vote is not null and old.vote is null
     and not exists (select 1 from profiles where id = new.user_id and is_ghost) then
    update match_players set vote = new.vote
    where match_id = new.match_id and vote is null
      and user_id in (select id from profiles where is_ghost);
  end if;
  return null;
end $$;
drop trigger if exists ghost_vote on public.match_players;
create trigger ghost_vote after update of vote on public.match_players
for each row execute function public.ghost_vote_trg();

-- ghosts: 1 goleiro + 8 linhas; quem entrar como Goleiro fecha a partida
do $$
declare i int; v_id uuid; v_pos text;
begin
  for i in 1..9 loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'fantasma'||i||'@fantasma.invalid', '', jsonb_build_object('name','Fantasma '||i), '{}'::jsonb, now(), now());
    update public.profiles set is_ghost = true, rating = 900 + i*25 where id = v_id;
    v_pos := case when i = 1 then 'Goleiro' when i <= 3 then 'Pivô' when i <= 6 then 'Ala' else 'Fixo' end;
    insert into public.queue (user_id, mode, region, position, joined_at)
    values (v_id, 5, 'SA', v_pos, now() - make_interval(secs => 100 - i));
  end loop;
end $$;