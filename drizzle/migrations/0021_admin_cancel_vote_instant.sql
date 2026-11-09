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
 IF public.has_role(v_uid,'admin') THEN
  UPDATE public.matches SET status='cancelled',completed_at=now() WHERE id=v_match;
  INSERT INTO public.mod_actions (actor_id, action, target_match, reason) VALUES (v_uid, 'cancelar_partida', v_match, 'voto de cancelamento do admin');
  RETURN 'cancelled';
 END IF;
 SELECT count(*) INTO v_count FROM public.match_players WHERE match_id=v_match AND cancel_vote;
 IF v_count>=6 THEN
  UPDATE public.matches SET status='cancelled',completed_at=now() WHERE id=v_match;
  RETURN 'cancelled';
 END IF;
 RETURN 'voting';
END $$;
COMMENT ON FUNCTION public.vote_cancel_match_gk() IS 'Participant cancellation ballot: admin vote cancels the match immediately; other players need six votes.';