ALTER TABLE public.match_kick_votes DROP CONSTRAINT match_kick_votes_status_check;
ALTER TABLE public.match_kick_votes ADD CONSTRAINT match_kick_votes_status_check CHECK (status IN ('active','pending_admin','approved','rejected','cancelled'));
ALTER TABLE public.match_kick_votes ADD COLUMN yes_count integer, ADD COLUMN no_count integer, ADD COLUMN decided_by uuid, ADD COLUMN decided_at timestamptz;
DROP INDEX IF EXISTS public.one_active_kick;
CREATE UNIQUE INDEX one_open_kick ON public.match_kick_votes(match_id) WHERE status IN ('active','pending_admin');

CREATE OR REPLACE FUNCTION public.kick_match_paused(p_match uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.match_kick_votes WHERE match_id=p_match AND status IN ('active','pending_admin'))
  OR EXISTS(SELECT 1 FROM public.match_replacements WHERE match_id=p_match AND replacement_id IS NULL) $$;

CREATE OR REPLACE FUNCTION public.resolve_match_kick_gk(p_match uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.match_kick_votes; m public.matches; yes_votes integer; no_votes integer;
BEGIN
 SELECT * INTO m FROM public.matches WHERE id=p_match FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 -- Pending admin decisions die with the match or when the target already left.
 UPDATE public.match_kick_votes k SET status='cancelled' WHERE k.match_id=p_match AND k.status='pending_admin'
  AND (m.status NOT IN('draft','room','voting','reporting','disputed') OR NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=p_match AND user_id=k.target_id));
 SELECT * INTO v FROM public.match_kick_votes WHERE match_id=p_match AND status='active' FOR UPDATE;
 IF FOUND AND (m.status NOT IN('draft','room','voting','reporting','disputed') OR v.ends_at<=now()) THEN
  IF m.status NOT IN('draft','room','voting','reporting','disputed') THEN UPDATE public.match_kick_votes SET status='cancelled' WHERE id=v.id;
  ELSE
   SELECT count(*) FILTER(WHERE b.approve),count(*) FILTER(WHERE NOT b.approve) INTO yes_votes,no_votes FROM public.match_kick_ballots b JOIN public.match_players p ON p.match_id=p_match AND p.user_id=b.user_id WHERE b.vote_id=v.id AND b.user_id<>v.target_id;
   IF yes_votes>no_votes AND EXISTS(SELECT 1 FROM public.match_players WHERE match_id=p_match AND user_id=v.target_id) THEN
    UPDATE public.match_kick_votes SET status='pending_admin',yes_count=yes_votes,no_count=no_votes WHERE id=v.id;
   ELSE
    UPDATE public.match_kick_votes SET status='rejected',yes_count=yes_votes,no_count=no_votes WHERE id=v.id;
    IF m.status='draft' THEN UPDATE public.matches SET deadline=now()+interval '30 seconds' WHERE id=p_match; END IF;
   END IF;
  END IF;
 END IF;
 PERFORM public.backfill_match_gk(p_match);
END $$;
REVOKE ALL ON FUNCTION public.resolve_match_kick_gk(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_match_kick_gk(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_decide_match_kick_gk(p_vote uuid, p_approve boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.match_kick_votes; m public.matches; target public.match_players;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Só administradores podem decidir expulsões.'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Decisão inválida.'; END IF;
 SELECT * INTO v FROM public.match_kick_votes WHERE id=p_vote;
 IF NOT FOUND THEN RAISE EXCEPTION 'Votação indisponível.'; END IF;
 SELECT * INTO m FROM public.matches WHERE id=v.match_id FOR UPDATE;
 SELECT * INTO v FROM public.match_kick_votes WHERE id=p_vote FOR UPDATE;
 IF v.status<>'pending_admin' THEN RAISE EXCEPTION 'Esta expulsão já foi decidida.'; END IF;
 IF m.status NOT IN('draft','room','voting','reporting','disputed') THEN
  UPDATE public.match_kick_votes SET status='cancelled',decided_by=auth.uid(),decided_at=now() WHERE id=v.id;
  RETURN 'cancelled';
 END IF;
 IF p_approve THEN
  SELECT * INTO target FROM public.match_players WHERE match_id=m.id AND user_id=v.target_id;
  IF NOT FOUND THEN
   UPDATE public.match_kick_votes SET status='cancelled',decided_by=auth.uid(),decided_at=now() WHERE id=v.id;
   RETURN 'cancelled';
  END IF;
  INSERT INTO public.match_replacements(match_id,removed_id,team,position,was_captain,removed_player) VALUES(m.id,target.user_id,target.team,target.position,target.user_id IN(m.captain_a,m.captain_b),to_jsonb(target));
  DELETE FROM public.match_players WHERE match_id=m.id AND user_id=target.user_id;
  UPDATE public.match_players SET vote=NULL,cancel_vote=false,shot_vote=NULL WHERE match_id=m.id;
  UPDATE public.matches SET shot_approved=false WHERE id=m.id AND shot_by IS NOT NULL;
  UPDATE public.match_kick_votes SET status='approved',decided_by=auth.uid(),decided_at=now() WHERE id=v.id;
  INSERT INTO public.mod_actions(actor_id,action,target_user,target_match,reason) VALUES(auth.uid(),'expulsao_aprovada_admin',target.user_id,m.id,coalesce(v.yes_count,0)||' sim / '||coalesce(v.no_count,0)||' não');
 ELSE
  UPDATE public.match_kick_votes SET status='rejected',decided_by=auth.uid(),decided_at=now() WHERE id=v.id;
  INSERT INTO public.mod_actions(actor_id,action,target_user,target_match,reason) VALUES(auth.uid(),'expulsao_recusada_admin',v.target_id,m.id,coalesce(v.yes_count,0)||' sim / '||coalesce(v.no_count,0)||' não');
 END IF;
 IF m.status='draft' THEN UPDATE public.matches SET deadline=now()+interval '30 seconds' WHERE id=m.id; END IF;
 PERFORM public.backfill_match_gk(m.id);
 RETURN CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
END $$;
REVOKE ALL ON FUNCTION public.admin_decide_match_kick_gk(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_match_kick_gk(uuid,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_pending_kicks_gk() RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 RETURN coalesce((SELECT json_agg(json_build_object(
   'id',v.id,'matchId',v.match_id,'matchStatus',m.status,'targetId',v.target_id,
   'targetName',(SELECT name FROM public.profiles WHERE id=v.target_id),
   'startedByName',(SELECT name FROM public.profiles WHERE id=v.started_by),
   'yes',coalesce(v.yes_count,0),'no',coalesce(v.no_count,0),'endedAt',v.ends_at) ORDER BY v.ends_at)
  FROM public.match_kick_votes v JOIN public.matches m ON m.id=v.match_id
  WHERE v.status='pending_admin' AND m.status IN('draft','room','voting','reporting','disputed')),'[]'::json);
END $$;
REVOKE ALL ON FUNCTION public.admin_pending_kicks_gk() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_pending_kicks_gk() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.start_match_kick_gk(p_match uuid, p_target uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE vote_id uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.uid()=p_target THEN RAISE EXCEPTION 'Não é possível votar para expulsar a si mesmo.'; END IF;
 PERFORM 1 FROM public.matches WHERE id=p_match AND status IN('draft','room','voting','reporting','disputed') FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=p_match AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Partida indisponível.'; END IF;
 PERFORM public.resolve_match_kick_gk(p_match);
 IF NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=p_match AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=p_match AND user_id=p_target) THEN RAISE EXCEPTION 'Jogador indisponível.'; END IF;
 IF EXISTS(SELECT 1 FROM public.match_kick_votes WHERE match_id=p_match AND status='pending_admin') THEN RAISE EXCEPTION 'Já existe uma expulsão aguardando a decisão do admin.'; END IF;
 SELECT id INTO vote_id FROM public.match_kick_votes WHERE match_id=p_match AND status='active';
 IF vote_id IS NOT NULL THEN RETURN vote_id; END IF;
 INSERT INTO public.match_kick_votes(match_id,target_id,started_by) VALUES(p_match,p_target,auth.uid()) RETURNING id INTO vote_id;
 RETURN vote_id;
END $$;

CREATE OR REPLACE FUNCTION public.poll_inhouse_gk() RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_draft json; v_state jsonb; m_id uuid; v_kick jsonb; v_removal jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 PERFORM public.queue_heartbeat_gk();
 SELECT m.id INTO m_id FROM public.matches m JOIN public.match_players p ON p.match_id=m.id WHERE p.user_id=auth.uid() AND m.status IN('draft','room','voting','reporting','disputed') ORDER BY m.created_at DESC LIMIT 1;
 IF m_id IS NOT NULL THEN PERFORM public.resolve_match_kick_gk(m_id); END IF;
 v_draft:=public.draft_tick_gk(); v_state:=public.get_inhouse_state_gk()::jsonb;
 IF v_state->'match' IS NOT NULL AND v_state->'match'<>'null'::jsonb THEN
  m_id:=(v_state->'match'->>'id')::uuid;
  SELECT jsonb_build_object('id',v.id,'status',v.status,'targetId',v.target_id,'targetName',(SELECT name FROM public.profiles WHERE id=v.target_id),'endsAt',v.ends_at,
    'yes',coalesce(v.yes_count,(SELECT count(*) FROM public.match_kick_ballots WHERE vote_id=v.id AND approve)),
    'no',coalesce(v.no_count,(SELECT count(*) FROM public.match_kick_ballots WHERE vote_id=v.id AND NOT approve)),
    'myVote',(SELECT approve FROM public.match_kick_ballots WHERE vote_id=v.id AND user_id=auth.uid()))
   INTO v_kick FROM public.match_kick_votes v WHERE match_id=m_id AND status IN ('active','pending_admin') LIMIT 1;
  v_state:=jsonb_set(v_state,'{match,kick}',coalesce(v_kick,'null'::jsonb));
  v_state:=jsonb_set(v_state,'{match,vacancies}',to_jsonb((SELECT count(*) FROM public.match_replacements WHERE match_id=m_id AND replacement_id IS NULL)));
 END IF;
 SELECT jsonb_build_object('id',r.id,'matchId',r.match_id) INTO v_removal FROM public.match_replacements r WHERE removed_id=auth.uid() ORDER BY created_at DESC LIMIT 1;
 v_state:=v_state||jsonb_build_object('lastRemoval',v_removal);
 RETURN json_build_object('state',v_state,'draft',v_draft);
END $$;