ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS shot_by uuid;

CREATE OR REPLACE FUNCTION public.set_screenshot_score_gk(p_match uuid, p_mine integer, p_theirs integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_team text; v_status text; v_by uuid; v_a integer; v_b integer; v_winner text; v_sa integer; v_sb integer;
BEGIN
  IF p_mine IS NULL OR p_theirs IS NULL OR p_mine < 0 OR p_theirs < 0 OR p_mine > 99 OR p_theirs > 99 THEN RAISE EXCEPTION 'placar_invalido'; END IF;
  -- Lock the match row so simultaneous prints are serialized; only the first one is accepted.
  SELECT status, shot_by INTO v_status, v_by FROM matches WHERE id = p_match FOR UPDATE;
  IF v_status IS NULL OR v_status = 'cancelled' THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT mp.team INTO v_team FROM match_players mp WHERE mp.match_id = p_match AND mp.user_id = auth.uid();
  IF v_team IS NULL THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF v_by IS NOT NULL OR v_status = 'completed' THEN RAISE EXCEPTION 'print_ja_enviado'; END IF;
  v_sa := CASE WHEN v_team = 'a' THEN p_mine ELSE p_theirs END;
  v_sb := CASE WHEN v_team = 'a' THEN p_theirs ELSE p_mine END;
  IF v_status NOT IN ('room','voting','reporting','disputed') THEN
    UPDATE matches SET shot_score_a = v_sa, shot_score_b = v_sb, shot_by = auth.uid() WHERE id = p_match;
    RETURN true;
  END IF;
  SELECT count(*) FILTER(WHERE vote='a'), count(*) FILTER(WHERE vote='b') INTO v_a, v_b FROM match_players WHERE match_id = p_match;
  v_winner := public.vote_winner_gk(v_a, v_b);
  IF v_winner IS NOT NULL THEN
    IF v_sa = v_sb THEN RAISE EXCEPTION 'placar_empatado'; END IF;
    IF (CASE WHEN v_sa > v_sb THEN 'a' ELSE 'b' END) <> v_winner THEN RAISE EXCEPTION 'placar_diferente_da_votacao'; END IF;
  END IF;
  UPDATE matches SET shot_score_a = v_sa, shot_score_b = v_sb, shot_by = auth.uid() WHERE id = p_match;
  IF v_winner IS NULL THEN RETURN true; END IF;
  PERFORM public.finalize_match_gk(p_match, v_sa, v_sb);
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.set_screenshot_stats_gk(p_match uuid, p_stats jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb; n integer := 0;
BEGIN
  -- Only the player whose print was accepted may write the stats.
  IF NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match AND shot_by = auth.uid()) THEN
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
END $function$;

CREATE INDEX IF NOT EXISTS match_players_user_match_idx ON public.match_players (user_id, match_id);