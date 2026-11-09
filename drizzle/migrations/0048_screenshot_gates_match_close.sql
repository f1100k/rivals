CREATE OR REPLACE FUNCTION public.vote_result_gk(p_side text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_match uuid; v_a integer; v_b integer; v_winner text; v_sa integer; v_sb integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF p_side IS NULL OR p_side NOT IN ('a','b') THEN RAISE EXCEPTION 'invalid_side'; END IF;
 SELECT m.id INTO v_match FROM public.matches m JOIN public.match_players mp ON mp.match_id=m.id WHERE mp.user_id=v_uid AND m.status IN ('room','voting','reporting') ORDER BY m.created_at DESC LIMIT 1 FOR UPDATE OF m;
 IF v_match IS NULL THEN RAISE EXCEPTION 'sem_partida_em_votacao'; END IF;
 IF EXISTS(SELECT 1 FROM public.match_players WHERE match_id=v_match AND user_id=v_uid AND (vote IS NOT NULL OR cancel_vote)) THEN RAISE EXCEPTION 'retire_voto_atual'; END IF;
 UPDATE public.matches SET status='voting' WHERE id=v_match;
 UPDATE public.match_players SET vote=p_side,cancel_vote=false WHERE match_id=v_match AND user_id=v_uid;
 SELECT count(*) FILTER(WHERE vote='a'),count(*) FILTER(WHERE vote='b') INTO v_a,v_b FROM public.match_players WHERE match_id=v_match;
 v_winner:=public.vote_winner_gk(v_a,v_b);
 IF v_winner IS NULL THEN RETURN 'voting'; END IF;
 SELECT shot_score_a,shot_score_b INTO v_sa,v_sb FROM public.matches WHERE id=v_match;
 IF v_sa IS NULL OR v_sb IS NULL OR v_sa=v_sb OR (CASE WHEN v_sa>v_sb THEN 'a' ELSE 'b' END)<>v_winner THEN
  UPDATE public.matches SET status='reporting' WHERE id=v_match;
  RETURN 'awaiting_screenshot';
 END IF;
 PERFORM public.finalize_match_gk(v_match,v_sa,v_sb);
 RETURN 'completed';
END $$;

CREATE OR REPLACE FUNCTION public.set_screenshot_score_gk(p_match uuid, p_mine integer, p_theirs integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_team text; v_status text; v_a integer; v_b integer; v_winner text; v_sa integer; v_sb integer;
BEGIN
  IF p_mine IS NULL OR p_theirs IS NULL OR p_mine < 0 OR p_theirs < 0 OR p_mine > 99 OR p_theirs > 99 THEN RAISE EXCEPTION 'placar_invalido'; END IF;
  SELECT mp.team, m.status INTO v_team, v_status FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.match_id = p_match AND mp.user_id = auth.uid() AND m.status <> 'cancelled'
    ORDER BY m.created_at DESC LIMIT 1;
  IF v_team IS NULL THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  UPDATE matches SET shot_score_a = CASE WHEN v_team = 'a' THEN p_mine ELSE p_theirs END,
                     shot_score_b = CASE WHEN v_team = 'a' THEN p_theirs ELSE p_mine END
    WHERE id = p_match;
  IF v_status NOT IN ('room','voting','reporting','disputed') THEN RETURN true; END IF;
  SELECT count(*) FILTER(WHERE vote='a'), count(*) FILTER(WHERE vote='b') INTO v_a, v_b FROM match_players WHERE match_id = p_match;
  v_winner := public.vote_winner_gk(v_a, v_b);
  IF v_winner IS NULL THEN RETURN true; END IF;
  v_sa := CASE WHEN v_team = 'a' THEN p_mine ELSE p_theirs END;
  v_sb := CASE WHEN v_team = 'a' THEN p_theirs ELSE p_mine END;
  IF v_sa = v_sb THEN RAISE EXCEPTION 'placar_empatado'; END IF;
  IF (CASE WHEN v_sa > v_sb THEN 'a' ELSE 'b' END) <> v_winner THEN RAISE EXCEPTION 'placar_diferente_da_votacao'; END IF;
  PERFORM public.finalize_match_gk(p_match, v_sa, v_sb);
  RETURN true;
END $$;