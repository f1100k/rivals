DO $patch$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.backfill_match_gk(uuid)'::regprocedure) INTO d;
 d:=replace(d,'cap uuid;','cap uuid; filled boolean:=false;');
 d:=replace(d,'UPDATE public.match_replacements SET replacement_id=q.user_id,replaced_at=now() WHERE id=vacancy.id;','UPDATE public.match_replacements SET replacement_id=q.user_id,replaced_at=now() WHERE id=vacancy.id; filled:=true;');
 d:=replace(d,'IF NOT public.kick_match_paused(p_match) THEN','IF filled AND NOT public.kick_match_paused(p_match) THEN'); EXECUTE d;
 SELECT pg_get_functiondef('public.cast_match_kick_gk(uuid,boolean)'::regprocedure) INTO d;
 d:=replace(d,'PERFORM 1 FROM public.matches WHERE id=v.match_id FOR UPDATE;','PERFORM 1 FROM public.matches WHERE id=v.match_id FOR UPDATE; SELECT * INTO v FROM public.match_kick_votes WHERE id=p_vote FOR UPDATE;'); EXECUTE d;
 SELECT pg_get_functiondef('public.start_match_kick_gk(uuid,uuid)'::regprocedure) INTO d;
 d:=replace(d,'PERFORM public.resolve_match_kick_gk(p_match);','PERFORM public.resolve_match_kick_gk(p_match); IF NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=p_match AND user_id=auth.uid()) THEN RAISE EXCEPTION ''Sem permissão.''; END IF;'); EXECUTE d;
 SELECT pg_get_functiondef('public.resolve_match_kick_gk(uuid)'::regprocedure) INTO d;
 d:=replace(d,'DELETE FROM public.match_player_stats WHERE match_id=p_match AND user_id=target.user_id;',''); EXECUTE d;
 SELECT pg_get_functiondef('public.finalize_match_gk(uuid,integer,integer)'::regprocedure) INTO d;
 d:=replace(d,'BEGIN IF public.kick_match_paused(p_match) THEN RAISE EXCEPTION ''Aguarde a votação de expulsão ou o substituto.''; END IF;','BEGIN');
 d:=replace(d,'IF NOT FOUND THEN RAISE EXCEPTION ''partida_ja_finalizada''; END IF;','IF NOT FOUND THEN RAISE EXCEPTION ''partida_ja_finalizada''; END IF; IF public.kick_match_paused(p_match) THEN RAISE EXCEPTION ''Aguarde a votação de expulsão ou o substituto.''; END IF;'); EXECUTE d;
 SELECT pg_get_functiondef('public.purge_finished_bot_matches()'::regprocedure) INTO d;
 d:=replace(d,'SELECT array_agg(DISTINCT removed_id) || v_bots INTO v_bots FROM public.match_replacements r JOIN public.profiles p ON p.id=r.removed_id WHERE r.match_id=ANY(v_matches) AND p.is_ghost; v_bots:=coalesce(v_bots,''{}'');','SELECT coalesce(array_agg(DISTINCT removed_id),''{}''::uuid[]) || v_bots INTO v_bots FROM public.match_replacements r JOIN public.profiles p ON p.id=r.removed_id WHERE r.match_id=ANY(v_matches) AND p.is_ghost AND NOT EXISTS(SELECT 1 FROM public.queue WHERE user_id=r.removed_id) AND NOT EXISTS(SELECT 1 FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id WHERE mp.user_id=r.removed_id AND m.status NOT IN(''completed'',''cancelled''));'); EXECUTE d;
END $patch$;