CREATE OR REPLACE FUNCTION public.finalize_match_gk(p_match uuid, p_a int, p_b int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result int;
BEGIN
  PERFORM 1 FROM matches WHERE id = p_match AND status IN ('room','voting','reporting','disputed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'partida_ja_finalizada'; END IF;
  IF p_a = p_b THEN RAISE EXCEPTION 'empate_nao_permitido'; END IF;
  v_result := CASE WHEN p_a > p_b THEN 1 ELSE 0 END;
  -- Fixed MMR deltas: winners +18, losers -17, regardless of ratings.
  UPDATE match_players SET delta = CASE WHEN team = 'a' THEN 18 * v_result - 17 * (1 - v_result) ELSE 18 * (1 - v_result) - 17 * v_result END WHERE match_id = p_match;
  UPDATE profiles pr SET rating = pr.rating + 18, wins = pr.wins + 1
    WHERE pr.id IN (SELECT user_id FROM match_players WHERE match_id = p_match AND team = CASE WHEN v_result = 1 THEN 'a' ELSE 'b' END);
  UPDATE profiles pr SET rating = pr.rating - 17, losses = pr.losses + 1
    WHERE pr.id IN (SELECT user_id FROM match_players WHERE match_id = p_match AND team = CASE WHEN v_result = 1 THEN 'b' ELSE 'a' END);
  UPDATE matches SET score_a = p_a, score_b = p_b, status = 'completed', completed_at = now() WHERE id = p_match;
END $$;
REVOKE EXECUTE ON FUNCTION public.finalize_match_gk(uuid, int, int) FROM PUBLIC, anon, authenticated;