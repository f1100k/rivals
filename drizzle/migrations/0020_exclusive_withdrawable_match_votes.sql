UPDATE public.match_players SET cancel_vote=false WHERE vote IS NOT NULL AND cancel_vote;
ALTER TABLE public.match_players ADD CONSTRAINT match_players_one_ballot CHECK (vote IS NULL OR NOT cancel_vote);
CREATE OR REPLACE FUNCTION public.vote_result_gk(p_side text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_match uuid; v_a integer; v_b integer; v_winner text;
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
 PERFORM public.finalize_match_gk(v_match,v_a,v_b);
 RETURN 'completed';
END $$;
CREATE OR REPLACE FUNCTION public.vote_cancel_match_gk()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_match uuid; v_status text; v_count integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 SELECT m.id,m.status INTO v_match,v_status FROM public.matches m JOIN public.match_players mp ON mp.match_id=m.id WHERE mp.user_id=v_uid AND m.status IN ('draft','room','voting','reporting','disputed') ORDER BY m.created_at DESC LIMIT 1 FOR UPDATE OF m;
 IF v_match IS NULL THEN RAISE EXCEPTION 'sem_partida_ativa'; END IF;
 IF v_status='draft' THEN RAISE EXCEPTION 'aguarde_fim_draft'; END IF;
 IF EXISTS(SELECT 1 FROM public.match_players WHERE match_id=v_match AND user_id=v_uid AND (vote IS NOT NULL OR cancel_vote)) THEN RAISE EXCEPTION 'retire_voto_atual'; END IF;
 UPDATE public.match_players SET cancel_vote=true,vote=NULL WHERE match_id=v_match AND user_id=v_uid;
 SELECT count(*) INTO v_count FROM public.match_players WHERE match_id=v_match AND cancel_vote;
 IF v_count>=6 THEN
  UPDATE public.matches SET status='cancelled',completed_at=now() WHERE id=v_match;
  RETURN 'cancelled';
 END IF;
 RETURN 'voting';
END $$;
CREATE OR REPLACE FUNCTION public.withdraw_match_vote_gk()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_match uuid; v_status text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 SELECT m.id,m.status INTO v_match,v_status FROM public.matches m JOIN public.match_players mp ON mp.match_id=m.id WHERE mp.user_id=v_uid AND m.status IN ('draft','room','voting','reporting','disputed') ORDER BY m.created_at DESC LIMIT 1 FOR UPDATE OF m;
 IF v_match IS NULL THEN RAISE EXCEPTION 'sem_partida_ativa'; END IF;
 IF v_status='draft' THEN RAISE EXCEPTION 'aguarde_fim_draft'; END IF;
 UPDATE public.match_players SET vote=NULL,cancel_vote=false WHERE match_id=v_match AND user_id=v_uid;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.withdraw_match_vote_gk() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.withdraw_match_vote_gk() TO authenticated;
COMMENT ON COLUMN public.match_players.cancel_vote IS 'Exclusive participant ballot: winner vote must be NULL; withdrawal is allowed only while the match remains open. Six cancellation votes cancel without changing Elo.';