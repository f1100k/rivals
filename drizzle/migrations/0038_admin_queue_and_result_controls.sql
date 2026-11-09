CREATE OR REPLACE FUNCTION public.admin_enqueue_test_bots(p_users uuid[], p_position text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer; v_uid uuid := auth.uid();
BEGIN
 IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_position NOT IN ('Goleiro','Pivô','Ala','Fixo') OR p_position IS NULL THEN RAISE EXCEPTION 'posicao_invalida'; END IF;
 IF coalesce(cardinality(p_users),0) NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'quantidade_invalida'; END IF;
 PERFORM pg_advisory_xact_lock(52719,5);
 IF EXISTS(SELECT 1 FROM unnest(p_users) u(id) LEFT JOIN profiles p ON p.id=u.id WHERE p.id IS NULL OR NOT p.is_ghost) THEN RAISE EXCEPTION 'apenas_bots'; END IF;
 IF EXISTS(SELECT 1 FROM match_players mp JOIN matches m ON m.id=mp.match_id WHERE mp.user_id=ANY(p_users) AND m.status NOT IN ('completed','cancelled')) THEN RAISE EXCEPTION 'bot_em_partida'; END IF;
 INSERT INTO queue(user_id,mode,region,position) SELECT DISTINCT u.id,5,'BR',p_position FROM unnest(p_users) u(id) WHERE NOT EXISTS(SELECT 1 FROM queue q WHERE q.user_id=u.id);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 INSERT INTO mod_actions(actor_id,action,reason) VALUES(v_uid,'adicionar_bots',format('%s bots · %s',v_count,p_position));
 PERFORM try_matchmake_gk();
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.admin_enqueue_test_bots(uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_enqueue_test_bots(uuid[],text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_close_match_vote(p_match uuid,p_side text,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_side IS NULL OR p_side NOT IN ('a','b') THEN RAISE EXCEPTION 'invalid_side'; END IF;
 IF length(trim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'motivo_obrigatorio'; END IF;
 SELECT status INTO v_status FROM matches WHERE id=p_match FOR UPDATE;
 IF v_status IS NULL OR v_status NOT IN ('room','voting','reporting','disputed') THEN RAISE EXCEPTION 'partida_indisponivel'; END IF;
 PERFORM public.admin_resolve_match(p_match,CASE WHEN p_side='a' THEN 6 ELSE 0 END,CASE WHEN p_side='b' THEN 6 ELSE 0 END,p_reason);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_close_match_vote(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_close_match_vote(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_control_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
 v:=public.get_admin_overview()::jsonb;
 IF NOT public.has_role(auth.uid(),'admin') THEN RETURN v || jsonb_build_object('queue','[]'::jsonb); END IF;
 RETURN v || jsonb_build_object('matches',coalesce((SELECT jsonb_agg(x ORDER BY x."createdAt" DESC) FROM (
 SELECT m.id,m.status,m.report_a AS "reportA",m.report_b AS "reportB",m.created_at AS "createdAt",m.room_code AS "roomCode",m.completed_at AS "completedAt",
 (SELECT name FROM profiles WHERE id=m.reported_by) AS "reportedBy",
 coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.name,'team',mp.team,'confirm',mp.confirm,'vote',mp.vote,'cancelVote',mp.cancel_vote,'position',mp.position,'isGhost',p.is_ghost) ORDER BY mp.team,p.name) FROM match_players mp JOIN profiles p ON p.id=mp.user_id WHERE mp.match_id=m.id),'[]'::jsonb) AS players
 FROM matches m ORDER BY m.created_at DESC LIMIT 50) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_admin_control_overview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_control_overview() TO authenticated;