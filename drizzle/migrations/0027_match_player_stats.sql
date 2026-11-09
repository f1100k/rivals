CREATE TABLE public.match_player_stats (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  goals integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  passes integer NOT NULL DEFAULT 0,
  interceptions integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  mvp boolean NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, user_id)
);
GRANT SELECT ON public.match_player_stats TO anon, authenticated;
GRANT ALL ON public.match_player_stats TO service_role;
ALTER TABLE public.match_player_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stats readable by everyone" ON public.match_player_stats FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.set_screenshot_stats_gk(p_match uuid, p_stats jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; n integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM match_players WHERE match_id = p_match AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM match_players WHERE match_id = p_match AND user_id = (r->>'user_id')::uuid) THEN
      INSERT INTO match_player_stats (match_id, user_id, goals, assists, passes, interceptions, saves, score, mvp)
      VALUES (p_match, (r->>'user_id')::uuid,
        greatest(0, least(50, coalesce((r->>'goals')::int, 0))),
        greatest(0, least(50, coalesce((r->>'assists')::int, 0))),
        greatest(0, least(500, coalesce((r->>'passes')::int, 0))),
        greatest(0, least(200, coalesce((r->>'interceptions')::int, 0))),
        greatest(0, least(200, coalesce((r->>'saves')::int, 0))),
        greatest(0, least(100000, coalesce((r->>'score')::int, 0))),
        coalesce((r->>'mvp')::boolean, false))
      ON CONFLICT (match_id, user_id) DO UPDATE SET goals = EXCLUDED.goals, assists = EXCLUDED.assists,
        passes = EXCLUDED.passes, interceptions = EXCLUDED.interceptions, saves = EXCLUDED.saves,
        score = EXCLUDED.score, mvp = EXCLUDED.mvp;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.set_screenshot_stats_gk(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_screenshot_stats_gk(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_stat_leaders()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x.goals DESC), '[]'::jsonb) FROM (
    SELECT p.id, p.name, p.avatar_url, count(*)::int AS games,
      sum(s.goals)::int AS goals, sum(s.assists)::int AS assists, sum(s.passes)::int AS passes,
      sum(s.interceptions)::int AS interceptions, sum(s.saves)::int AS saves,
      count(*) FILTER (WHERE s.mvp)::int AS mvps
    FROM match_player_stats s JOIN profiles p ON p.id = s.user_id
    JOIN matches m ON m.id = s.match_id AND m.status <> 'cancelled'
    WHERE NOT p.is_ghost
    GROUP BY p.id, p.name, p.avatar_url
  ) x
$$;
GRANT EXECUTE ON FUNCTION public.get_stat_leaders() TO anon, authenticated;