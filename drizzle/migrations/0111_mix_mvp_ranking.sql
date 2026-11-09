CREATE OR REPLACE FUNCTION public.get_mix_mvp_ranking() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.mvps DESC, x.games, x.name), '[]'::jsonb) FROM (
    SELECT p.id, p.name, p.avatar_url,
      count(*) FILTER (WHERE s.mvp)::int AS mvps,
      count(*)::int AS games
    FROM public.matches m
    JOIN public.match_player_stats s ON s.match_id = m.id
    JOIN public.profiles p ON p.id = s.user_id AND NOT p.is_ghost
    WHERE m.is_mix AND m.status = 'completed' AND m.region <> 'TESTE' AND NOT m.had_bots
    GROUP BY p.id, p.name, p.avatar_url
    HAVING count(*) FILTER (WHERE s.mvp) > 0
    LIMIT 200
  ) x;
$$;
GRANT EXECUTE ON FUNCTION public.get_mix_mvp_ranking() TO anon, authenticated, service_role;