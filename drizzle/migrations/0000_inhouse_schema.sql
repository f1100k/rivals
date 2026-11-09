-- Perfis dos jogadores
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  rating integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable by everyone"
  on public.profiles for select using (true);
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Fila de matchmaking
create table public.queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  mode integer not null check (mode in (3, 4, 5)),
  region text not null,
  joined_at timestamptz not null default now()
);
grant select on public.queue to anon, authenticated;
grant all on public.queue to service_role;
alter table public.queue enable row level security;
create policy "queue readable by everyone"
  on public.queue for select using (true);

-- Partidas
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  mode integer not null check (mode in (3, 4, 5)),
  region text not null,
  status text not null default 'ready',
  deadline timestamptz,
  score_a integer,
  score_b integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
grant select on public.matches to anon, authenticated;
grant all on public.matches to service_role;
alter table public.matches enable row level security;
create policy "matches readable by everyone"
  on public.matches for select using (true);

-- Jogadores por partida
create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team text check (team in ('a', 'b')),
  accepted boolean not null default false,
  rating_before integer not null default 1000,
  delta integer,
  primary key (match_id, user_id)
);
grant select on public.match_players to anon, authenticated;
grant all on public.match_players to service_role;
alter table public.match_players enable row level security;
create policy "match players readable by everyone"
  on public.match_players for select using (true);

-- Perfil criado automaticamente no cadastro
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Monta partidas quando a fila fecha
create or replace function public.try_matchmake()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  need integer;
  v_match uuid;
begin
  for r in
    select mode, region, count(*)::int as total
    from public.queue
    group by mode, region
  loop
    need := r.mode * 2;
    if r.total >= need then
      insert into public.matches (mode, region, status, deadline)
      values (r.mode, r.region, 'ready', now() + interval '20 seconds')
      returning id into v_match;

      with picked as (
        select q.id as queue_id, q.user_id
        from public.queue q
        where q.mode = r.mode and q.region = r.region
        order by q.joined_at
        limit need
      ),
      mp as (
        insert into public.match_players (match_id, user_id, rating_before)
        select v_match, p_.user_id, pr.rating
        from picked p_
        join public.profiles pr on pr.id = p_.user_id
      )
      delete from public.queue where id in (select queue_id from picked);
    end if;
  end loop;
end;
$$;

-- Entrar na fila
create or replace function public.join_queue(p_mode integer, p_region text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_mode not in (3, 4, 5) then
    raise exception 'invalid_mode';
  end if;

  select m.id into v_active
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where mp.user_id = auth.uid() and m.status in ('ready', 'lobby')
  limit 1;
  if v_active is not null then
    return false;
  end if;

  delete from public.queue where user_id = auth.uid();
  insert into public.queue (user_id, mode, region) values (auth.uid(), p_mode, p_region);
  perform public.try_matchmake();
  return true;
end;
$$;

-- Sair da fila
create or replace function public.leave_queue()
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

-- Aceitar a partida
create or replace function public.match_accept(p_match_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_accepted int;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.match_players
    where match_id = p_match_id and user_id = auth.uid()
  ) then
    raise exception 'not_participant';
  end if;

  select status into v_status from public.matches where id = p_match_id;
  if v_status <> 'ready' then
    return v_status;
  end if;

  update public.match_players set accepted = true
  where match_id = p_match_id and user_id = auth.uid();

  select count(*), count(*) filter (where accepted)
  into v_total, v_accepted
  from public.match_players where match_id = p_match_id;

  if v_total > 0 and v_accepted = v_total then
    update public.match_players mp
    set team = t.new_team
    from (
      select mp2.user_id as uid,
        case ((row_number() over (order by pr.rating desc, pr.id)) - 1) % 4
          when 0 then 'a' when 1 then 'b' when 2 then 'b' else 'a'
        end as new_team
      from public.match_players mp2
      join public.profiles pr on pr.id = mp2.user_id
      where mp2.match_id = p_match_id
    ) t
    where mp.match_id = p_match_id and mp.user_id = t.uid;

    update public.matches set status = 'lobby'
    where id = p_match_id and status = 'ready';
    return 'lobby';
  end if;
  return 'ready';
end;
$$;

-- Recusar a partida (cancela e devolve os outros para a fila)
create or replace function public.match_decline(p_match_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode int;
  v_region text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.match_players
    where match_id = p_match_id and user_id = auth.uid()
  ) then
    raise exception 'not_participant';
  end if;

  select mode, region into v_mode, v_region from public.matches where id = p_match_id;

  insert into public.queue (user_id, mode, region)
  select mp.user_id, v_mode, v_region
  from public.match_players mp
  where mp.match_id = p_match_id and mp.user_id <> auth.uid()
  on conflict (user_id) do nothing;

  delete from public.matches where id = p_match_id;
  return 'cancelled';
end;
$$;

-- Cancela partidas cuja confirmação expirou e devolve para a fila
create or replace function public.match_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id, mode, region from public.matches
    where status = 'ready' and deadline < now()
  loop
    insert into public.queue (user_id, mode, region)
    select mp.user_id, r.mode, r.region
    from public.match_players mp
    where mp.match_id = r.id
    on conflict (user_id) do nothing;
    delete from public.matches where id = r.id;
  end loop;
end;
$$;

-- Reportar o placar (Elo por time)
create or replace function public.match_report(
  p_match_id uuid,
  p_score_a integer,
  p_score_b integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_a numeric;
  v_b numeric;
  v_result int;
  v_da int;
  v_db int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.match_players
    where match_id = p_match_id and user_id = auth.uid()
  ) then
    raise exception 'not_participant';
  end if;

  select status into v_status from public.matches where id = p_match_id;
  if v_status <> 'lobby' then
    return false;
  end if;
  if p_score_a = p_score_b then
    raise exception 'empate_nao_permitido';
  end if;

  select avg(rating_before) filter (where team = 'a'),
         avg(rating_before) filter (where team = 'b')
  into v_a, v_b
  from public.match_players where match_id = p_match_id;

  v_result := case when p_score_a > p_score_b then 1 else 0 end;
  v_da := round(32 * (v_result::numeric - 1 / (1 + power(10, (v_b - v_a) / 400.0))));
  v_db := round(32 * ((1 - v_result)::numeric - 1 / (1 + power(10, (v_a - v_b) / 400.0))));

  update public.match_players set delta = v_da
  where match_id = p_match_id and team = 'a';
  update public.match_players set delta = v_db
  where match_id = p_match_id and team = 'b';

  update public.profiles pr set
    rating = pr.rating + v_da,
    wins = pr.wins + v_result,
    losses = pr.losses + (1 - v_result)
  where pr.id in (
    select user_id from public.match_players
    where match_id = p_match_id and team = 'a'
  );

  update public.profiles pr set
    rating = pr.rating + v_db,
    wins = pr.wins + (1 - v_result),
    losses = pr.losses + v_result
  where pr.id in (
    select user_id from public.match_players
    where match_id = p_match_id and team = 'b'
  );

  update public.matches
  set score_a = p_score_a, score_b = p_score_b,
      status = 'completed', completed_at = now()
  where id = p_match_id;
  return true;
end;
$$;

-- Renomear o nick
create or replace function public.rename_profile(p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if length(trim(p_name)) < 2 or length(trim(p_name)) > 20 then
    raise exception 'invalid_name';
  end if;
  update public.profiles set name = trim(p_name) where id = auth.uid();
  return true;
end;
$$;

-- Estado completo para o cliente
create or replace function public.get_inhouse_state()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_me json;
  v_queue json;
  v_queue_count int;
  v_match json;
  v_history json;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  perform public.match_cleanup();

  select to_jsonb(p)::json into v_me
  from public.profiles p where p.id = v_uid;

  select to_jsonb(q)::json into v_queue
  from public.queue q where q.user_id = v_uid;

  select count(*)::int into v_queue_count
  from public.queue q
  join public.queue mine on mine.user_id = v_uid
    and q.mode = mine.mode and q.region = mine.region;

  select to_jsonb(x)::json into v_match
  from (
    select m.id, m.mode, m.region, m.status, m.deadline, m.score_a, m.score_b, m.created_at,
      coalesce(json_agg(json_build_object(
        'userId', mp.user_id, 'name', pr.name, 'rating', mp.rating_before,
        'team', mp.team, 'accepted', mp.accepted, 'delta', mp.delta,
        'isMe', mp.user_id = v_uid
      ) order by mp.team nulls last, mp.rating_before desc), '[]'::json) as players
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    join public.profiles pr on pr.id = mp.user_id
    where mp.user_id = v_uid and m.status in ('ready', 'lobby')
    group by m.id
  ) x;

  select coalesce(json_agg(h), '[]'::json) into v_history
  from (
    select m.id, m.mode, m.region, m.score_a, m.score_b,
      m.created_at as "createdAt",
      json_agg(json_build_object(
        'name', pr.name, 'team', mp.team, 'delta', mp.delta
      ) order by mp.team, mp.rating_before desc) as players
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    join public.profiles pr on pr.id = mp.user_id
    where m.status = 'completed'
    group by m.id
    order by m.completed_at desc
    limit 30
  ) h;

  return json_build_object(
    'me', v_me,
    'queue', v_queue,
    'queueCount', v_queue_count,
    'match', v_match,
    'history', v_history
  );
end;
$$;

grant execute on function public.join_queue(integer, text) to authenticated;
grant execute on function public.leave_queue() to authenticated;
grant execute on function public.match_accept(uuid) to authenticated;
grant execute on function public.match_decline(uuid) to authenticated;
grant execute on function public.match_report(uuid, integer, integer) to authenticated;
grant execute on function public.rename_profile(text) to authenticated;
grant execute on function public.get_inhouse_state() to authenticated;
