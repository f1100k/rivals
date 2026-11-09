CREATE OR REPLACE FUNCTION public.vote_winner_gk(p_a integer,p_b integer) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE WHEN p_a >= 6 THEN 'a' WHEN p_b >= 6 THEN 'b' ELSE NULL END $$;
CREATE OR REPLACE FUNCTION public.vote_result_gk(p_side text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_match uuid; v_a integer; v_b integer; v_winner text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF p_side IS NULL OR p_side NOT IN ('a','b') THEN RAISE EXCEPTION 'invalid_side'; END IF;
 SELECT m.id INTO v_match FROM public.matches m JOIN public.match_players mp ON mp.match_id=m.id WHERE mp.user_id=v_uid AND m.status IN ('room','voting','reporting') ORDER BY m.created_at DESC LIMIT 1 FOR UPDATE OF m;
 IF v_match IS NULL THEN RAISE EXCEPTION 'sem_partida_em_votacao'; END IF;
 IF EXISTS(SELECT 1 FROM public.match_players WHERE match_id=v_match AND user_id=v_uid AND vote IS NOT NULL) THEN RAISE EXCEPTION 'ja_votou'; END IF;
 UPDATE public.matches SET status='voting' WHERE id=v_match;
 UPDATE public.match_players SET vote=p_side WHERE match_id=v_match AND user_id=v_uid;
 SELECT count(*) FILTER(WHERE vote='a'),count(*) FILTER(WHERE vote='b') INTO v_a,v_b FROM public.match_players WHERE match_id=v_match;
 v_winner := public.vote_winner_gk(v_a,v_b);
 IF v_winner IS NULL THEN RETURN 'voting'; END IF;
 PERFORM public.finalize_match_gk(v_match,v_a,v_b);
 RETURN 'completed';
END $$;
REVOKE ALL ON FUNCTION public.vote_result_gk(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vote_result_gk(text) TO authenticated;
COMMENT ON FUNCTION public.vote_result_gk(text) IS 'Participant winner vote: six votes for the same team finalize once through finalize_match_gk, then participants may join the next queue.';