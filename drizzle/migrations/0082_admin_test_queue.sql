DO $$
DECLARE d text;
BEGIN
  -- matchmaking per pool
  d := pg_get_functiondef('public.try_matchmake_gk()'::regprocedure);
  d := replace(d, 'public.try_matchmake_gk()', 'public.try_matchmake_pool_gk(p_test boolean)');
  d := replace(d, 'IF (SELECT count(*) FROM public.queue) < 10', 'IF (SELECT count(*) FROM public.queue WHERE (region = ''TESTE'') = p_test) < 10');
  d := replace(d, 'pg_try_advisory_xact_lock(52719, 6)', 'pg_try_advisory_xact_lock(52719, CASE WHEN p_test THEN 16 ELSE 6 END)');
  d := replace(d, 'WHERE q.position = ''Goleiro''', 'WHERE q.position = ''Goleiro'' AND (q.region = ''TESTE'') = p_test');
  d := replace(d, 'WHERE q.position IS NOT NULL AND q.position <> ''Goleiro''', 'WHERE q.position IS NOT NULL AND q.position <> ''Goleiro'' AND (q.region = ''TESTE'') = p_test');
  d := replace(d, 'VALUES (5, ''SA'', ''draft''', 'VALUES (5, CASE WHEN p_test THEN ''TESTE'' ELSE ''SA'' END, ''draft''');
  IF position('p_test) < 10' in d) = 0 OR position('THEN ''TESTE'' ELSE ''SA''' in d) = 0 THEN RAISE EXCEPTION 'matchmake patch failed'; END IF;
  EXECUTE d;

  -- finalize: test matches never score
  d := pg_get_functiondef('public.finalize_match_gk(uuid,integer,integer)'::regprocedure);
  d := replace(d, 'WHERE mp.match_id = p_match AND pr.is_ghost) INTO bot_match;',
    'WHERE mp.match_id = p_match AND pr.is_ghost) OR EXISTS(SELECT 1 FROM public.matches WHERE id = p_match AND region = ''TESTE'') INTO bot_match;');
  IF position('region = ''TESTE''' in d) = 0 THEN RAISE EXCEPTION 'finalize patch failed'; END IF;
  EXECUTE d;

  -- queue counts follow my pool
  d := pg_get_functiondef('public.get_inhouse_state_gk()'::regprocedure);
  d := replace(d, 'INTO v_counts FROM queue WHERE position IS NOT NULL;',
    'INTO v_counts FROM queue WHERE position IS NOT NULL AND (region = ''TESTE'') = coalesce((SELECT q2.region = ''TESTE'' FROM queue q2 WHERE q2.user_id = v_uid), false);');
  d := replace(d, '''match'', v_match,', '''testMode'', coalesce((SELECT region = ''TESTE'' FROM queue WHERE user_id = v_uid), false) OR coalesce((SELECT m.region = ''TESTE'' FROM matches m JOIN match_players mp ON mp.match_id = m.id WHERE mp.user_id = v_uid AND m.status IN (''draft'',''room'',''voting'',''reporting'',''disputed'') LIMIT 1), false), ''match'', v_match,');
  IF position('testMode' in d) = 0 OR position('q2.user_id' in d) = 0 THEN RAISE EXCEPTION 'state patch failed'; END IF;
  EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION public.try_matchmake_gk() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  PERFORM public.try_matchmake_pool_gk(false);
  PERFORM public.try_matchmake_pool_gk(true);
END $f$;

CREATE OR REPLACE FUNCTION public.join_test_queue_gk(p_position text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_position IS NULL OR p_position NOT IN ('Goleiro','Pivô','Ala','Fixo') THEN RAISE EXCEPTION 'invalid_position'; END IF;
  IF EXISTS (SELECT 1 FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id WHERE mp.user_id=auth.uid() AND m.status IN ('ready','lobby','draft','room','voting','reporting','disputed')) THEN RAISE EXCEPTION 'finalize_partida_atual'; END IF;
  DELETE FROM public.queue WHERE user_id=auth.uid();
  INSERT INTO public.queue(user_id,mode,region,position) VALUES(auth.uid(),5,'TESTE',p_position);
  PERFORM public.try_matchmake_gk(); RETURN true;
END $f$;

CREATE OR REPLACE FUNCTION public.admin_enqueue_test_bots(p_users uuid[], p_position text, p_test boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_count integer; v_uid uuid := auth.uid();
BEGIN
 IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_position NOT IN ('Goleiro','Pivô','Ala','Fixo') OR p_position IS NULL THEN RAISE EXCEPTION 'posicao_invalida'; END IF;
 IF coalesce(cardinality(p_users),0) NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'quantidade_invalida'; END IF;
 PERFORM pg_advisory_xact_lock(52719, CASE WHEN p_test THEN 16 ELSE 6 END);
 IF EXISTS(SELECT 1 FROM unnest(p_users) u(id) LEFT JOIN profiles p ON p.id=u.id WHERE p.id IS NULL OR NOT p.is_ghost) THEN RAISE EXCEPTION 'apenas_bots'; END IF;
 IF EXISTS(SELECT 1 FROM match_players mp JOIN matches m ON m.id=mp.match_id WHERE mp.user_id=ANY(p_users) AND m.status NOT IN ('completed','cancelled')) THEN RAISE EXCEPTION 'bot_em_partida'; END IF;
 INSERT INTO queue(user_id,mode,region,position) SELECT DISTINCT u.id,5,CASE WHEN p_test THEN 'TESTE' ELSE 'BR' END,p_position FROM unnest(p_users) u(id) WHERE NOT EXISTS(SELECT 1 FROM queue q WHERE q.user_id=u.id);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 INSERT INTO mod_actions(actor_id,action,reason) VALUES(v_uid,'adicionar_bots',format('%s bots · %s%s',v_count,p_position,CASE WHEN p_test THEN ' · fila teste' ELSE '' END));
 PERFORM try_matchmake_gk();
 RETURN v_count;
END $f$;

REVOKE EXECUTE ON FUNCTION public.try_matchmake_pool_gk(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_test_queue_gk(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enqueue_test_bots(uuid[], text, boolean) TO authenticated;