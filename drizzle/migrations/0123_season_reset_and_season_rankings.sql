-- Window of a season (NULL = the active one). Rankings filter matches by created_at inside it.
CREATE OR REPLACE FUNCTION public.season_bounds(p_season uuid)
RETURNS TABLE(from_at timestamptz, to_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(s.started_at, '-infinity'::timestamptz), coalesce(s.finished_at, 'infinity'::timestamptz)
  FROM (SELECT 1) one
  LEFT JOIN LATERAL (
    SELECT started_at, finished_at FROM public.seasons
    WHERE status IN ('active','finished') AND CASE WHEN p_season IS NULL THEN status = 'active' ELSE id = p_season END
    LIMIT 1
  ) s ON true
$$;
GRANT EXECUTE ON FUNCTION public.season_bounds(uuid) TO anon, authenticated, service_role;

-- Rank-up reward key: plain tier for Season 0 (keeps old keys), season-scoped afterwards so rewards come back each season.
CREATE OR REPLACE FUNCTION public.rank_grant_key(p_tier integer)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN n IS NULL OR n = 0 THEN p_tier::text ELSE 's'||n||':'||p_tier END
  FROM (SELECT (SELECT number FROM public.seasons WHERE status = 'active' LIMIT 1) AS n) x
$$;
REVOKE ALL ON FUNCTION public.rank_grant_key(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rank_grant_key(integer) TO service_role;

DO $patch$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.finalize_match_gk(uuid,integer,integer)'::regprocedure);
  d := replace(d, $r$'rank_grant', t::text, 'rank'$r$, $r$'rank_grant', public.rank_grant_key(t), 'rank'$r$);
  IF position('rank_grant_key' in d) = 0 THEN RAISE EXCEPTION 'finalize_match_gk patch did not apply'; END IF;
  EXECUTE d;
END $patch$;

-- New-season reset: MMR, record and streaks to zero; rank-up rewards can be earned again. Coins, items and protector stock stay.
CREATE OR REPLACE FUNCTION public.season_reset_progress()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  UPDATE public.profiles SET rating = 0, wins = 0, losses = 0, win_streak = 0, best_win_streak = 0
  WHERE NOT is_ghost AND (rating <> 0 OR wins <> 0 OR losses <> 0 OR win_streak <> 0 OR best_win_streak <> 0);
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.point_protection_wallets SET highest_tier = 0 WHERE highest_tier <> 0;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.season_reset_progress() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.season_reset_progress() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_finish_season(p_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_start timestamptz; v_number int; v_end timestamptz := now(); n integer; v_next uuid; v_reset integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('season_state'));
  SELECT status, started_at, number INTO v_status, v_start, v_number FROM public.seasons WHERE id = p_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'season_inexistente'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'season_nao_ativa'; END IF;
  DELETE FROM public.season_player_stats WHERE season_id = p_id;
  WITH ranked AS (
    SELECT p.id, p.rating, row_number() OVER (ORDER BY p.rating DESC, p.wins DESC, p.name)::int AS pos,
      greatest(p.wins - coalesce(b.wins,0), 0) AS w, greatest(p.losses - coalesce(b.losses,0), 0) AS l
    FROM public.profiles p LEFT JOIN public.season_baselines b ON b.season_id = p_id AND b.user_id = p.id
    WHERE NOT p.is_ghost
  ), full_rows AS (
    SELECT r.*, public.season_match_stats(r.id, v_start, v_end) AS st FROM ranked r
  )
  INSERT INTO public.season_player_stats(season_id, user_id, final_rank, final_rating, wins, losses, goals, assists, passes, interceptions, gk_saves, gk_games, mvps, likes)
  SELECT p_id, id, pos, rating, w, l, (st->>'goals')::int, (st->>'assists')::int, (st->>'passes')::int, (st->>'interceptions')::int,
    (st->>'gk_saves')::int, (st->>'gk_games')::int, (st->>'mvps')::int, (st->>'likes')::int
  FROM full_rows
  WHERE w + l > 0 OR (st->>'goals')::int + (st->>'assists')::int + (st->>'passes')::int + (st->>'interceptions')::int + (st->>'gk_games')::int + (st->>'mvps')::int > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.player_profile_tags SET season_id = p_id WHERE season_id IS NULL AND granted_at >= v_start AND granted_at <= v_end;
  UPDATE public.seasons SET status = 'finished', finished_at = v_end WHERE id = p_id;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'season_finished', p_id::text||': '||n||' jogadores');

  v_reset := public.season_reset_progress();
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'season_reset', v_reset||' jogadores zerados');

  SELECT id INTO v_next FROM public.seasons WHERE number = v_number + 1 AND status = 'planned';
  IF v_next IS NULL THEN
    INSERT INTO public.seasons(number, name, created_by)
    VALUES ((SELECT max(number) + 1 FROM public.seasons), 'Season '||(SELECT max(number) + 1 FROM public.seasons), auth.uid())
    RETURNING id INTO v_next;
  END IF;
  PERFORM public.admin_start_season(v_next, false);
  RETURN n;
END $function$;

-- Final ranking of a finished season, from the frozen snapshot.
CREATE OR REPLACE FUNCTION public.get_season_ranking(p_season uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'avatar_url',p.avatar_url,'rating',x.final_rating,
    'wins',x.wins,'losses',x.losses,'final_rank',x.final_rank) ORDER BY x.final_rank NULLS LAST, p.name), '[]'::jsonb)
  FROM public.season_player_stats x JOIN public.profiles p ON p.id = x.user_id AND NOT p.is_ghost
  JOIN public.seasons s ON s.id = x.season_id AND s.status = 'finished'
  WHERE x.season_id = p_season AND x.wins + x.losses > 0
$$;
GRANT EXECUTE ON FUNCTION public.get_season_ranking(uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_stat_leaders();
CREATE FUNCTION public.get_stat_leaders(p_season uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x.goals DESC), '[]'::jsonb) FROM (
    SELECT p.id, p.name, p.avatar_url, count(*)::int AS games,
      sum(s.goals)::int AS goals, sum(s.assists)::int AS assists, sum(s.passes)::int AS passes,
      sum(s.interceptions)::int AS interceptions, sum(s.saves)::int AS saves,
      coalesce(sum(s.saves) FILTER (WHERE mp.position = 'Goleiro'), 0)::int AS gk_saves,
      count(*) FILTER (WHERE mp.position = 'Goleiro')::int AS gk_games,
      count(*) FILTER (WHERE s.mvp)::int AS mvps
    FROM public.season_bounds(p_season) w, public.match_player_stats s JOIN public.profiles p ON p.id = s.user_id
    JOIN public.matches m ON m.id = s.match_id AND m.status <> 'cancelled'
    LEFT JOIN public.match_players mp ON mp.match_id = s.match_id AND mp.user_id = s.user_id
    WHERE NOT p.is_ghost AND m.created_at >= w.from_at AND m.created_at < w.to_at
    GROUP BY p.id, p.name, p.avatar_url
  ) x
$$;
GRANT EXECUTE ON FUNCTION public.get_stat_leaders(uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_mix_ranking();
CREATE FUNCTION public.get_mix_ranking(p_season uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.balance DESC, x.wins DESC, x.losses, x.name), '[]'::jsonb) FROM (
    SELECT g.id, g.name, g.avatar_url, g.rating,
      count(*) FILTER (WHERE g.won)::int AS wins,
      count(*) FILTER (WHERE NOT g.won)::int AS losses,
      (count(*) FILTER (WHERE g.won) - count(*) FILTER (WHERE NOT g.won))::int AS balance
    FROM (
      SELECT p.id, p.name, p.avatar_url, p.rating,
        CASE WHEN e.counts_as IS NOT NULL THEN e.counts_as = 'win'
             ELSE mp.team = CASE WHEN m.score_a > m.score_b THEN 'a' ELSE 'b' END END AS won
      FROM public.season_bounds(p_season) w, public.matches m
      JOIN public.match_players mp ON mp.match_id = m.id AND mp.team IS NOT NULL
      JOIN public.profiles p ON p.id = mp.user_id AND NOT p.is_ghost
      LEFT JOIN public.mix_ranking_exclusions e ON e.match_id = m.id AND e.user_id = mp.user_id
      WHERE m.is_mix AND m.status = 'completed' AND m.region <> 'TESTE' AND NOT m.had_bots
        AND m.score_a IS NOT NULL AND m.score_b IS NOT NULL AND m.score_a <> m.score_b
        AND (e.match_id IS NULL OR e.counts_as IS NOT NULL)
        AND m.created_at >= w.from_at AND m.created_at < w.to_at
    ) g
    GROUP BY g.id, g.name, g.avatar_url, g.rating
    LIMIT 200
  ) x
$$;
GRANT EXECUTE ON FUNCTION public.get_mix_ranking(uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_mix_mvp_ranking();
CREATE FUNCTION public.get_mix_mvp_ranking(p_season uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.mvps DESC, x.games, x.name), '[]'::jsonb) FROM (
    SELECT p.id, p.name, p.avatar_url,
      count(*) FILTER (WHERE s.mvp)::int AS mvps,
      count(*)::int AS games
    FROM public.season_bounds(p_season) w, public.matches m
    JOIN public.match_player_stats s ON s.match_id = m.id
    JOIN public.profiles p ON p.id = s.user_id AND NOT p.is_ghost
    WHERE m.is_mix AND m.status = 'completed' AND m.region <> 'TESTE' AND NOT m.had_bots
      AND m.created_at >= w.from_at AND m.created_at < w.to_at
    GROUP BY p.id, p.name, p.avatar_url
    HAVING count(*) FILTER (WHERE s.mvp) > 0
    LIMIT 200
  ) x
$$;
GRANT EXECUTE ON FUNCTION public.get_mix_mvp_ranking(uuid) TO anon, authenticated, service_role;