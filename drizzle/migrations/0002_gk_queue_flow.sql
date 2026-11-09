-- Fluxo 5v5 com goleiros: posição na fila, escolha dos times, código da sala e votação
alter table public.queue add column position text;
alter table public.match_players add column vote text check (vote in ('a', 'b'));
alter table public.match_players add column position text;
alter table public.matches add column room_code text;

comment on column public.queue.mode is 'Legacy field from the 3v3/4v4/5v5 queue; the goalkeeper flow always inserts 5.';

-- Monta a partida quando a fila fecha: 2 goleiros (capitães) + 8 jogadores de linha
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
    select user_id, row_number() over (order by joined_at) as rn
    from (
      select user_id from public.queue where position = 'Goleiro' order by joined_at limit 2 for update
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

-- Entrar na fila declarando a posição
create or replace function public.join_queue_gk(p_position text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_position not in ('Goleiro', 'Pivô', 'Ala', 'Fixo') then
    raise exception 'invalid_position';
  end if;
  if exists (
    select 1
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
    where mp.user_id = auth.uid()
      and m.status in ('ready', 'lobby', 'draft', 'room', 'voting')
  ) then
    return false;
  end if;

  delete from public.queue where user_id = auth.uid();
  insert into public.queue (user_id, mode, region, position)
  values (auth.uid(), 5, 'SA', p_position);
  perform public.try_matchmake_gk();
  return true;
end;
$$;

-- Sair da fila
create or replace function public.leave_queue_gk()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from public.queue where user_id = auth.uid();
  return true;
end;
$$;

-- Goleiro escolhe um jogador de linha para o seu time
create or replace function public.draft_pick(p_target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match uuid;
  v_my_team text;
  v_turn text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select mp.match_id, mp.team into v_match, v_my_team
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where mp.user_id = v_uid and mp.position = 'Goleiro' and m.status = 'draft'
  limit 1;
  if v_match is null then
    raise exception 'sem_partida_em_escolha';
  end if;

  select case
    when count(*) filter (where team = 'a') <= count(*) filter (where team = 'b') then 'a'
    else 'b'
  end into v_turn
  from public.match_players
  where match_id = v_match;

  if v_my_team is distinct from v_turn then
    raise exception 'nao_e_sua_vez';
  end if;

  if not exists (
    select 1 from public.match_players
    where match_id = v_match and user_id = p_target and team is null
  ) then
    raise exception 'jogador_indisponivel';
  end if;

  update public.match_players set team = v_turn
  where match_id = v_match and user_id = p_target;

  if not exists (
    select 1 from public.match_players where match_id = v_match and team is null
  ) then
    update public.matches set status = 'room' where id = v_match;
  end if;
  return true;
end;
$$;

-- Salvar o código da sala (qualquer participante)
create or replace function public.set_room_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_code is null or length(btrim(p_code)) = 0 or length(btrim(p_code)) > 64 then
    raise exception 'invalid_code';
  end if;

  select mp.match_id into v_match
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where mp.user_id = auth.uid() and m.status in ('draft', 'room', 'voting')
  limit 1;
  if v_match is null then
    raise exception 'sem_partida_ativa';
  end if;

  update public.matches set room_code = btrim(p_code) where id = v_match;
  return true;
end;
$$;

-- Votar em quem venceu: seis votos confirmam o vencedor e atualizam o MMR
create or replace function public.vote_match(p_side text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match uuid;
  v_va int;
  v_vb int;
  v_total int;
  v_result int;
  v_a numeric;
  v_b numeric;
  v_da int;
  v_db int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_side not in ('a', 'b') then
    raise exception 'invalid_side';
  end if;

  select mp.match_id into v_match
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where mp.user_id = v_uid and m.status in ('room', 'voting')
  limit 1;
  if v_match is null then
    raise exception 'sem_partida_em_votacao';
  end if;

  if exists (
    select 1 from public.match_players
    where match_id = v_match and user_id = v_uid and vote is not null
  ) then
    raise exception 'ja_votou';
  end if;

  update public.match_players set vote = p_side
  where match_id = v_match and user_id = v_uid;

  update public.matches set status = 'voting'
  where id = v_match and status = 'room';

  select count(*) filter (where vote = 'a'),
         count(*) filter (where vote = 'b'),
         count(*)
  into v_va, v_vb, v_total
  from public.match_players where match_id = v_match;

  if v_va < 6 and v_vb < 6 then
    return 'voting';
  end if;

  v_result := case when v_va >= 6 then 1 else 0 end;

  select avg(rating_before) filter (where team = 'a'),
         avg(rating_before) filter (where team = 'b')
  into v_a, v_b
  from public.match_players where match_id = v_match;

  v_da := round(32 * (v_result::numeric - 1 / (1 + power(10, (v_b - v_a) / 400.0))));
  v_db := round(32 * ((1 - v_result)::numeric - 1 / (1 + power(10, (v_a - v_b) / 400.0))));

  update public.match_players set delta = v_da
  where match_id = v_match and team = 'a';
  update public.match_players set delta = v_db
  where match_id = v_match and team = 'b';

  update public.profiles pr set
    rating = pr.rating + v_da,
    wins = pr.wins + v_result,
    losses = pr.losses + (1 - v_result)
  where pr.id in (
    select user_id from public.match_players
    where match_id = v_match and team = 'a'
  );

  update public.profiles pr set
    rating = pr.rating + v_db,
    wins = pr.wins + (1 - v_result),
    losses = pr.losses + v_result
  where pr.id in (
    select user_id from public.match_players
    where match_id = v_match and team = 'b'
  );

  update public.matches
  set score_a = v_va, score_b = v_vb, status = 'completed', completed_at = now()
  where id = v_match;
  return 'completed';
end;
$$;

-- Sair de uma partida em andamento: cancela e devolve os outros para a fila
create or replace function public.abandon_match_gk()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select mp.match_id into v_match
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where mp.user_id = v_uid and m.status in ('draft', 'room', 'voting')
  limit 1;
  if v_match is null then
    raise exception 'sem_partida_ativa';
  end if;

  insert into public.queue (user_id, mode, region, position)
  select mp.user_id, 5, 'SA', mp.position
  from public.match_players mp
  where mp.match_id = v_match and mp.user_id <> v_uid
  on conflict (user_id) do nothing;

  delete from public.matches where id = v_match;
  return true;
end;
$$;

-- Estado completo do fluxo com goleiros
create or replace function public.get_inhouse_state_gk()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_me json;
  v_queue json;
  v_counts json;
  v_match json;
  v_last json;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select to_jsonb(p)::json into v_me
  from public.profiles p where p.id = v_uid;

  select to_jsonb(q)::json into v_queue
  from public.queue q where q.user_id = v_uid;

  select json_build_object(
    'total', count(*),
    'goalkeepers', count(*) filter (where position = 'Goleiro'),
    'outfield', count(*) filter (where position is not null and position <> 'Goleiro')
  )::json into v_counts
  from public.queue where position is not null;

  select to_jsonb(x)::json into v_match
  from (
    select m.id, m.status, m.room_code as "roomCode", m.created_at as "createdAt",
      coalesce(json_agg(json_build_object(
        'userId', mp.user_id, 'name', pr.name, 'rating', mp.rating_before,
        'position', mp.position, 'team', mp.team, 'vote', mp.vote,
        'isMe', mp.user_id = v_uid
      ) order by mp.team nulls last, (mp.position = 'Goleiro') desc, mp.rating_before desc), '[]'::json) as players
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    join public.profiles pr on pr.id = mp.user_id
    where m.status in ('draft', 'room', 'voting')
      and exists (
        select 1 from public.match_players mine
        where mine.match_id = m.id and mine.user_id = v_uid
      )
    group by m.id
  ) x;

  select to_jsonb(h)::json into v_last
  from (
    select m.score_a as "scoreA", m.score_b as "scoreB", m.completed_at as "completedAt",
      json_agg(json_build_object(
        'name', pr.name, 'team', mp.team, 'delta', mp.delta
      ) order by mp.team, mp.rating_before desc) as players
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    join public.profiles pr on pr.id = mp.user_id
    where m.status = 'completed'
      and exists (
        select 1 from public.match_players mine
        where mine.match_id = m.id and mine.user_id = v_uid
      )
    group by m.id
    order by m.completed_at desc
    limit 1
  ) h;

  return json_build_object(
    'me', v_me,
    'queue', v_queue,
    'counts', v_counts,
    'match', v_match,
    'lastResult', v_last
  );
end;
$$;

grant execute on function public.join_queue_gk(text) to authenticated;
grant execute on function public.leave_queue_gk() to authenticated;
grant execute on function public.draft_pick(uuid) to authenticated;
grant execute on function public.set_room_code(text) to authenticated;
grant execute on function public.vote_match(text) to authenticated;
grant execute on function public.abandon_match_gk() to authenticated;
grant execute on function public.get_inhouse_state_gk() to authenticated;
