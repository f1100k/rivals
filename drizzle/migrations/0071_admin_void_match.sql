CREATE OR REPLACE FUNCTION public.admin_void_match(p_match uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_status text; v_a int; v_b int; r record; v_win text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT status, score_a, score_b INTO v_status, v_a, v_b FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'partida_nao_encontrada'; END IF;
  IF v_status <> 'completed' THEN RETURN false; END IF;
  v_win := CASE WHEN v_a > v_b THEN 'a' WHEN v_b > v_a THEN 'b' ELSE NULL END;
  FOR r IN SELECT user_id, team, delta FROM public.match_players WHERE match_id = p_match ORDER BY user_id LOOP
    PERFORM public.lock_competitive_player(r.user_id);
    UPDATE public.profiles SET
      rating = greatest(0, rating - coalesce(r.delta, 0)),
      wins = CASE WHEN v_win IS NOT NULL AND r.team = v_win THEN greatest(0, wins - 1) ELSE wins END,
      losses = CASE WHEN v_win IS NOT NULL AND r.team IS NOT NULL AND r.team <> v_win THEN greatest(0, losses - 1) ELSE losses END
    WHERE id = r.user_id;
  END LOOP;
  UPDATE public.match_players SET delta = 0 WHERE match_id = p_match;
  UPDATE public.matches SET status = 'cancelled' WHERE id = p_match;
  INSERT INTO public.mod_actions (actor_id, action, target_match, reason)
    VALUES (auth.uid(), 'desclassificar_partida', p_match, p_reason);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_void_match(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_void_match(uuid, text) TO authenticated;