SET LOCAL lock_timeout = '8s';
LOCK TABLE public.matches, public.match_players IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS shot_path text, ADD COLUMN IF NOT EXISTS shot_approved boolean NOT NULL DEFAULT false;
ALTER TABLE public.match_players ADD COLUMN IF NOT EXISTS shot_vote boolean;
UPDATE public.matches SET shot_approved = true WHERE shot_by IS NOT NULL;

DROP FUNCTION IF EXISTS public.set_screenshot_score_gk(uuid, integer, integer);
CREATE FUNCTION public.set_screenshot_score_gk(p_match uuid, p_mine integer, p_theirs integer, p_path text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_team text; v_status text; v_by uuid; v_sa integer; v_sb integer;
BEGIN
  IF p_mine IS NULL OR p_theirs IS NULL OR p_mine < 0 OR p_theirs < 0 OR p_mine > 99 OR p_theirs > 99 THEN RAISE EXCEPTION 'placar_invalido'; END IF;
  IF p_mine = p_theirs THEN RAISE EXCEPTION 'placar_empatado'; END IF;
  SELECT status, shot_by INTO v_status, v_by FROM matches WHERE id = p_match FOR UPDATE;
  IF v_status IS NULL OR v_status = 'cancelled' THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT mp.team INTO v_team FROM match_players mp WHERE mp.match_id = p_match AND mp.user_id = auth.uid();
  IF v_team IS NULL THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF v_by IS NOT NULL OR v_status = 'completed' THEN RAISE EXCEPTION 'print_ja_enviado'; END IF;
  v_sa := CASE WHEN v_team = 'a' THEN p_mine ELSE p_theirs END;
  v_sb := CASE WHEN v_team = 'a' THEN p_theirs ELSE p_mine END;
  UPDATE matches SET shot_score_a = v_sa, shot_score_b = v_sb, shot_by = auth.uid(), shot_path = p_path, shot_approved = false WHERE id = p_match;
  UPDATE match_players SET shot_vote = NULL WHERE match_id = p_match;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.set_screenshot_score_gk(uuid, integer, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_screenshot_score_gk(uuid, integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.vote_screenshot_gk(p_match uuid, p_ok boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_status text; v_by uuid; v_path text; v_yes int; v_no int; v_a int; v_b int; v_w text; v_sa int; v_sb int; v_ok boolean;
BEGIN
  IF p_ok IS NULL THEN RAISE EXCEPTION 'voto_invalido'; END IF;
  SELECT status, shot_by, shot_path, shot_score_a, shot_score_b, shot_approved INTO v_status, v_by, v_path, v_sa, v_sb, v_ok FROM matches WHERE id = p_match FOR UPDATE;
  IF v_status IS NULL OR v_status IN ('cancelled','completed') THEN RAISE EXCEPTION 'partida_encerrada'; END IF;
  IF v_by IS NULL THEN RAISE EXCEPTION 'sem_print'; END IF;
  IF NOT EXISTS (SELECT 1 FROM match_players WHERE match_id = p_match AND user_id = auth.uid() AND team IS NOT NULL) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF v_ok THEN RETURN 'approved'; END IF;
  UPDATE match_players SET shot_vote = p_ok WHERE match_id = p_match AND user_id = auth.uid();
  SELECT count(*) FILTER (WHERE shot_vote), count(*) FILTER (WHERE shot_vote = false) INTO v_yes, v_no FROM match_players WHERE match_id = p_match;
  IF v_no >= 6 THEN
    UPDATE matches SET shot_by = NULL, shot_score_a = NULL, shot_score_b = NULL, shot_path = NULL, shot_approved = false WHERE id = p_match;
    UPDATE match_players SET shot_vote = NULL WHERE match_id = p_match;
    DELETE FROM match_player_stats WHERE match_id = p_match;
    RETURN 'rejected:' || coalesce(v_path, '');
  END IF;
  IF v_yes < 6 THEN RETURN 'pending'; END IF;
  UPDATE matches SET shot_approved = true WHERE id = p_match;
  SELECT count(*) FILTER (WHERE vote='a'), count(*) FILTER (WHERE vote='b') INTO v_a, v_b FROM match_players WHERE match_id = p_match;
  v_w := public.vote_winner_gk(v_a, v_b);
  IF v_w IS NOT NULL AND v_w = (CASE WHEN v_sa > v_sb THEN 'a' ELSE 'b' END) THEN
    PERFORM public.finalize_match_gk(p_match, v_sa, v_sb);
    RETURN 'completed';
  END IF;
  RETURN 'approved';
END $$;
REVOKE ALL ON FUNCTION public.vote_screenshot_gk(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vote_screenshot_gk(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_match_shot_gk(p_match uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM match_players WHERE match_id = p_match AND user_id = auth.uid()) THEN NULL ELSE
  jsonb_build_object(
    'path', m.shot_path, 'byName', (SELECT name FROM profiles WHERE id = m.shot_by), 'hasShot', m.shot_by IS NOT NULL,
    'scoreA', m.shot_score_a, 'scoreB', m.shot_score_b, 'approved', m.shot_approved,
    'yes', (SELECT count(*) FROM match_players WHERE match_id = p_match AND shot_vote),
    'no', (SELECT count(*) FROM match_players WHERE match_id = p_match AND shot_vote = false),
    'myVote', (SELECT shot_vote FROM match_players WHERE match_id = p_match AND user_id = auth.uid()))
  END FROM matches m WHERE m.id = p_match
$$;
REVOKE ALL ON FUNCTION public.get_match_shot_gk(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_match_shot_gk(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.vote_result_gk(p_side text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid:=auth.uid(); v_match uuid; v_a integer; v_b integer; v_winner text; v_sa integer; v_sb integer; v_ok boolean;
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
 SELECT shot_score_a,shot_score_b,shot_approved INTO v_sa,v_sb,v_ok FROM public.matches WHERE id=v_match;
 IF NOT v_ok OR v_sa IS NULL OR v_sb IS NULL OR v_sa=v_sb OR (CASE WHEN v_sa>v_sb THEN 'a' ELSE 'b' END)<>v_winner THEN
  UPDATE public.matches SET status='reporting' WHERE id=v_match;
  RETURN 'awaiting_screenshot';
 END IF;
 PERFORM public.finalize_match_gk(v_match,v_sa,v_sb);
 RETURN 'completed';
END $function$;