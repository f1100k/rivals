CREATE OR REPLACE FUNCTION public.try_matchmake_gk()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_gks uuid[]; v_out uuid[]; v_match uuid; v_swap boolean := random() < 0.5;
BEGIN
 -- Pollers and joins must never build overlapping matches.
 IF NOT pg_try_advisory_xact_lock(52719, 5) THEN RETURN; END IF;
 SELECT array_agg(q.user_id ORDER BY q.joined_at,q.id) INTO v_gks FROM (
  SELECT q.user_id,q.joined_at,q.id FROM public.queue q WHERE q.position='Goleiro'
  AND NOT EXISTS (SELECT 1 FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id
   WHERE mp.user_id=q.user_id AND m.status IN ('ready','lobby','draft','room','voting','reporting','disputed'))
  ORDER BY q.joined_at,q.id LIMIT 2 FOR UPDATE OF q SKIP LOCKED
 ) q;
 IF coalesce(cardinality(v_gks),0) < 2 THEN RETURN; END IF;
 SELECT array_agg(q.user_id ORDER BY q.joined_at,q.id) INTO v_out FROM (
  SELECT q.user_id,q.joined_at,q.id FROM public.queue q WHERE q.position IS NOT NULL AND q.position<>'Goleiro'
  AND NOT EXISTS (SELECT 1 FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id
   WHERE mp.user_id=q.user_id AND m.status IN ('ready','lobby','draft','room','voting','reporting','disputed'))
  ORDER BY q.joined_at,q.id LIMIT 8 FOR UPDATE OF q SKIP LOCKED
 ) q;
 IF coalesce(cardinality(v_out),0) < 8 THEN RETURN; END IF;
 INSERT INTO public.matches(mode,region,status,deadline) VALUES(5,'SA','draft',now()+interval '30 seconds') RETURNING id INTO v_match;
 INSERT INTO public.match_players(match_id,user_id,team,position,rating_before)
 SELECT v_match,g.user_id,CASE WHEN (g.rn=1) <> v_swap THEN 'a' ELSE 'b' END,'Goleiro',p.rating
 FROM unnest(v_gks) WITH ORDINALITY g(user_id,rn) JOIN public.profiles p ON p.id=g.user_id;
 INSERT INTO public.match_players(match_id,user_id,team,position,rating_before)
 SELECT v_match,q.user_id,NULL,q.position,p.rating FROM public.queue q JOIN public.profiles p ON p.id=q.user_id WHERE q.user_id=ANY(v_out);
 DELETE FROM public.queue WHERE user_id=ANY(v_gks) OR user_id=ANY(v_out);
END $$;
REVOKE ALL ON FUNCTION public.try_matchmake_gk() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.try_matchmake_gk() TO service_role;

CREATE OR REPLACE FUNCTION public.draft_tick_gk()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_match uuid; v_deadline timestamptz; v_status text; v_n integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 -- Recover a full queue even if bots arrived after the last human join.
 IF EXISTS (SELECT 1 FROM public.queue WHERE user_id=auth.uid()) THEN
  PERFORM public.try_matchmake_gk();
 END IF;
 SELECT m.id INTO v_match FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id
 WHERE mp.user_id=auth.uid() AND m.status='draft' ORDER BY m.created_at DESC LIMIT 1;
 IF v_match IS NULL THEN RETURN NULL; END IF;
 PERFORM public.draft_tick(v_match);
 SELECT deadline,status INTO v_deadline,v_status FROM public.matches WHERE id=v_match;
 IF v_status <> 'draft' THEN RETURN NULL; END IF;
 SELECT count(*) INTO v_n FROM public.match_players WHERE match_id=v_match AND team IS NOT NULL AND position<>'Goleiro';
 RETURN json_build_object('deadline',v_deadline,'turn',public.draft_turn(v_match),'picksLeft',(public.draft_step(v_n)->>'picksLeft')::integer);
END $$;
REVOKE ALL ON FUNCTION public.draft_tick_gk() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.draft_tick_gk() TO authenticated,service_role;