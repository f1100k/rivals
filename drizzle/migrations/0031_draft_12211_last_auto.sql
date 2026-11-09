CREATE OR REPLACE FUNCTION public.draft_step(p_count integer) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT jsonb_build_object('turn', CASE WHEN p_count=0 THEN 'a' WHEN p_count<3 THEN 'b' WHEN p_count<5 THEN 'a' WHEN p_count=5 THEN 'b' WHEN p_count=6 THEN 'a' ELSE 'b' END, 'picksLeft', CASE WHEN p_count=0 THEN 1 WHEN p_count<3 THEN 3-p_count WHEN p_count<5 THEN 5-p_count WHEN p_count<8 THEN 1 ELSE 0 END, 'seconds', 30);
$$;
CREATE OR REPLACE FUNCTION public.draft_assign(p_match uuid, p_target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_n integer; v_before integer; v_first text;
BEGIN
 SELECT draft_first_team INTO v_first FROM public.matches WHERE id=p_match AND status='draft' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT count(*) INTO v_before FROM public.match_players WHERE match_id=p_match AND team IS NOT NULL AND position <> 'Goleiro';
 UPDATE public.match_players SET team=public.draft_turn(p_match) WHERE match_id=p_match AND user_id=p_target AND team IS NULL;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT count(*) INTO v_n FROM public.match_players WHERE match_id=p_match AND team IS NOT NULL AND position <> 'Goleiro';
 IF v_n=7 THEN
  UPDATE public.match_players SET team=public.draft_team(7,v_first) WHERE match_id=p_match AND team IS NULL;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.match_players WHERE match_id=p_match AND team IS NULL) THEN
  UPDATE public.matches SET status='room', deadline=NULL WHERE id=p_match AND status='draft'; RETURN;
 END IF;
 IF public.draft_step(v_before)->>'turn' IS DISTINCT FROM public.draft_step(v_n)->>'turn' THEN
  UPDATE public.matches SET deadline=now() + make_interval(secs => (public.draft_step(v_n)->>'seconds')::integer) WHERE id=p_match;
 END IF;
END $$;