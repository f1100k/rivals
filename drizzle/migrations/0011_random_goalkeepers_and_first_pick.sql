ALTER TABLE public.matches ADD COLUMN draft_first_team text NOT NULL DEFAULT (CASE WHEN random() < 0.5 THEN 'a' ELSE 'b' END) CHECK (draft_first_team IN ('a','b'));
COMMENT ON COLUMN public.matches.draft_first_team IS 'Independent 50/50 draw, fixed for this match. First captain drafts 2, then other 2, first 1, other 2, remaining player to first.';
GRANT EXECUTE ON FUNCTION public.draft_step(integer) TO PUBLIC;
CREATE OR REPLACE FUNCTION public.draft_team(p_count integer, p_first text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN public.draft_step(p_count)->>'turn'='a' THEN p_first WHEN p_first='a' THEN 'b' ELSE 'a' END;
$$;
CREATE OR REPLACE FUNCTION public.draft_turn(p_match uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.draft_team((SELECT count(*)::integer FROM public.match_players WHERE match_id=p_match AND team IS NOT NULL AND position <> 'Goleiro'),m.draft_first_team) FROM public.matches m WHERE m.id=p_match;
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
 IF v_n = 7 THEN UPDATE public.match_players SET team=v_first WHERE match_id=p_match AND team IS NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.match_players WHERE match_id=p_match AND team IS NULL) THEN
  UPDATE public.matches SET status='room', deadline=NULL WHERE id=p_match AND status='draft'; RETURN;
 END IF;
 IF public.draft_step(v_before)->>'turn' IS DISTINCT FROM public.draft_step(v_n)->>'turn' THEN
  UPDATE public.matches SET deadline=now() + make_interval(secs => (public.draft_step(v_n)->>'seconds')::integer) WHERE id=p_match;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.draft_tick_gk() RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_match uuid; v_deadline timestamptz; v_status text; v_n integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 SELECT m.id INTO v_match FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id WHERE mp.user_id=auth.uid() AND m.status='draft' LIMIT 1;
 IF v_match IS NULL THEN RETURN NULL; END IF;
 PERFORM public.draft_tick(v_match);
 SELECT deadline,status INTO v_deadline,v_status FROM public.matches WHERE id=v_match;
 IF v_status <> 'draft' THEN RETURN NULL; END IF;
 SELECT count(*) INTO v_n FROM public.match_players WHERE match_id=v_match AND team IS NOT NULL AND position <> 'Goleiro';
 RETURN json_build_object('deadline',v_deadline,'turn',public.draft_turn(v_match),'picksLeft',(public.draft_step(v_n)->>'picksLeft')::integer);
END $$;
CREATE OR REPLACE FUNCTION public.try_matchmake_gk() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_gks integer; v_out integer; v_match uuid; v_swap boolean := random() < 0.5;
BEGIN
 SELECT count(*) INTO v_gks FROM (SELECT user_id FROM public.queue WHERE position='Goleiro' ORDER BY joined_at LIMIT 2 FOR UPDATE) g;
 IF v_gks < 2 THEN RETURN; END IF;
 SELECT count(*) INTO v_out FROM (SELECT user_id FROM public.queue WHERE position IS NOT NULL AND position <> 'Goleiro' ORDER BY joined_at LIMIT 8 FOR UPDATE) o;
 IF v_out < 8 THEN RETURN; END IF;
 INSERT INTO public.matches(mode,region,status) VALUES(5,'SA','draft') RETURNING id INTO v_match;
 INSERT INTO public.match_players(match_id,user_id,team,position,rating_before)
 SELECT v_match,g.user_id,CASE WHEN (g.rn=1) <> v_swap THEN 'a' ELSE 'b' END,'Goleiro',pr.rating
 FROM (SELECT user_id,row_number() OVER (ORDER BY locked.joined_at) AS rn FROM (SELECT user_id,joined_at FROM public.queue WHERE position='Goleiro' ORDER BY joined_at LIMIT 2 FOR UPDATE) locked) g JOIN public.profiles pr ON pr.id=g.user_id;
 INSERT INTO public.match_players(match_id,user_id,team,position,rating_before)
 SELECT v_match,o.user_id,NULL,o.position,pr.rating FROM (SELECT user_id,position FROM public.queue WHERE position IS NOT NULL AND position <> 'Goleiro' ORDER BY joined_at LIMIT 8 FOR UPDATE) o JOIN public.profiles pr ON pr.id=o.user_id;
 DELETE FROM public.queue WHERE user_id IN (SELECT user_id FROM public.match_players WHERE match_id=v_match);
END $$;
REVOKE ALL ON FUNCTION public.try_matchmake_gk(), public.draft_turn(uuid), public.draft_assign(uuid,uuid), public.draft_tick(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.draft_tick_gk() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.draft_tick_gk() TO authenticated;