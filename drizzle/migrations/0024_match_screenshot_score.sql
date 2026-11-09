ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS shot_score_a integer, ADD COLUMN IF NOT EXISTS shot_score_b integer;
CREATE OR REPLACE FUNCTION public.set_screenshot_score_gk(p_match uuid, p_mine integer, p_theirs integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_team text;
BEGIN
  IF p_mine IS NULL OR p_theirs IS NULL OR p_mine < 0 OR p_theirs < 0 OR p_mine > 99 OR p_theirs > 99 THEN RAISE EXCEPTION 'placar_invalido'; END IF;
  SELECT mp.team INTO v_team FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.match_id = p_match AND mp.user_id = auth.uid() AND m.status <> 'cancelled';
  IF v_team IS NULL THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  UPDATE matches SET shot_score_a = CASE WHEN v_team = 'a' THEN p_mine ELSE p_theirs END,
                     shot_score_b = CASE WHEN v_team = 'a' THEN p_theirs ELSE p_mine END
    WHERE id = p_match;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.set_screenshot_score_gk(uuid, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_screenshot_score_gk(uuid, integer, integer) TO authenticated;