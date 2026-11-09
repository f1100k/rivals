CREATE OR REPLACE FUNCTION public.draft_step(p_count integer) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT jsonb_build_object('turn', CASE WHEN p_count < 2 THEN 'a' WHEN p_count < 4 THEN 'b' WHEN p_count = 4 THEN 'a' WHEN p_count < 7 THEN 'b' ELSE 'a' END, 'picksLeft', CASE WHEN p_count < 2 THEN 2-p_count WHEN p_count < 4 THEN 4-p_count WHEN p_count = 4 THEN 1 WHEN p_count < 7 THEN 7-p_count WHEN p_count = 7 THEN 1 ELSE 0 END, 'seconds', 30);
$$;
REVOKE ALL ON FUNCTION public.draft_step(integer) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.draft_turn(p_match uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.draft_step(count(*)::integer)->>'turn' FROM public.match_players WHERE match_id=p_match AND team IS NOT NULL AND position <> 'Goleiro';
$$;
CREATE OR REPLACE FUNCTION public.draft_assign(p_match uuid, p_target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_n integer; v_before integer;
BEGIN
 PERFORM 1 FROM public.matches WHERE id=p_match AND status='draft' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT count(*) INTO v_before FROM public.match_players WHERE match_id=p_match AND team IS NOT NULL AND position <> 'Goleiro';
 UPDATE public.match_players SET team=public.draft_turn(p_match) WHERE match_id=p_match AND user_id=p_target AND team IS NULL;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT count(*) INTO v_n FROM public.match_players WHERE match_id=p_match AND team IS NOT NULL AND position <> 'Goleiro';
 IF v_n = 7 THEN
  UPDATE public.match_players SET team='a' WHERE match_id=p_match AND team IS NULL;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.match_players WHERE match_id=p_match AND team IS NULL) THEN
  UPDATE public.matches SET status='room', deadline=NULL WHERE id=p_match AND status='draft';
  RETURN;
 END IF;
 IF public.draft_step(v_before)->>'turn' IS DISTINCT FROM public.draft_step(v_n)->>'turn' THEN
  UPDATE public.matches SET deadline=now() + make_interval(secs => (public.draft_step(v_n)->>'seconds')::integer) WHERE id=p_match;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.draft_tick(p_match uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_n integer; v_left integer; v_target uuid; i integer;
BEGIN
 PERFORM 1 FROM public.matches WHERE id=p_match AND status='draft' AND deadline < now() FOR UPDATE;
 IF FOUND THEN
  SELECT count(*) INTO v_n FROM public.match_players WHERE match_id=p_match AND team IS NOT NULL AND position <> 'Goleiro';
  v_left := (public.draft_step(v_n)->>'picksLeft')::integer;
  FOR i IN 1..v_left LOOP
   SELECT user_id INTO v_target FROM public.match_players WHERE match_id=p_match AND team IS NULL ORDER BY random() LIMIT 1;
   EXIT WHEN v_target IS NULL;
   PERFORM public.draft_assign(p_match,v_target);
  END LOOP;
 END IF;
 PERFORM public.ghost_autopick(p_match);
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
 RETURN json_build_object('deadline',v_deadline,'turn',public.draft_step(v_n)->>'turn','picksLeft',(public.draft_step(v_n)->>'picksLeft')::integer);
END $$;
REVOKE ALL ON FUNCTION public.draft_turn(uuid), public.draft_assign(uuid,uuid), public.draft_tick(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.draft_tick_gk() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.draft_tick_gk() TO authenticated;