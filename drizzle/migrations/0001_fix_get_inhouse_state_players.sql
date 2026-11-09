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
    where m.status in ('ready', 'lobby')
      and exists (
        select 1 from public.match_players mine
        where mine.match_id = m.id and mine.user_id = v_uid
      )
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
