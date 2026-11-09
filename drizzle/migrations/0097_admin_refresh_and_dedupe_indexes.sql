-- Three identical (status, completed_at DESC) indexes existed; keep one to cut write/memory overhead.
DROP INDEX IF EXISTS public.matches_status_completed_idx;
DROP INDEX IF EXISTS public.matches_status_completed_at_idx;

CREATE OR REPLACE FUNCTION public.admin_refresh_inhouse_gk() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; v_removed integer:=0; v_drafts integer:=0; v_active integer:=0; v_before integer; v_after integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Só administradores podem atualizar filas e partidas.'; END IF;
 -- Same offline rule as the heartbeat sweep (real players idle for 10 minutes).
 DELETE FROM public.queue q USING public.profiles p WHERE p.id=q.user_id AND NOT p.is_ghost AND q.last_seen < now()-interval '10 minutes';
 GET DIAGNOSTICS v_removed = ROW_COUNT;
 -- Close expired expulsion votes and fill open vacancies for every live match.
 FOR r IN SELECT id FROM public.matches WHERE status IN('draft','room','voting','reporting','disputed') ORDER BY created_at LOOP
  PERFORM public.resolve_match_kick_gk(r.id); v_active:=v_active+1;
 END LOOP;
 -- Advance drafts whose turn timer already ran out (same schedule as automatic picks).
 FOR r IN SELECT id FROM public.matches WHERE status='draft' ORDER BY created_at LOOP
  PERFORM public.draft_tick(r.id); v_drafts:=v_drafts+1;
 END LOOP;
 SELECT count(*) INTO v_before FROM public.matches;
 PERFORM public.try_matchmake_gk();
 SELECT count(*) INTO v_after FROM public.matches;
 INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'atualizar_filas_partidas',
  v_removed||' removido(s) por inatividade, '||v_drafts||' draft(s), '||(v_after-v_before)||' partida(s) nova(s)');
 RETURN jsonb_build_object('removedOffline',v_removed,'activeMatches',v_active,'drafts',v_drafts,'newMatches',v_after-v_before,
  'queue',(SELECT count(*) FROM public.queue WHERE region<>'TESTE'),'testQueue',(SELECT count(*) FROM public.queue WHERE region='TESTE'));
END $$;
REVOKE ALL ON FUNCTION public.admin_refresh_inhouse_gk() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_refresh_inhouse_gk() TO authenticated,service_role;