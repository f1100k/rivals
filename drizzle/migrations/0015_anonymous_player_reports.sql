CREATE TABLE public.player_report_state (
 target_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 strikes integer NOT NULL DEFAULT 0,
 cycle integer NOT NULL DEFAULT 0,
 eligible_since timestamptz NOT NULL DEFAULT '-infinity',
 banned_until timestamptz
);
GRANT SELECT ON public.player_report_state TO authenticated;
GRANT ALL ON public.player_report_state TO service_role;
ALTER TABLE public.player_report_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own report sanction" ON public.player_report_state FOR SELECT TO authenticated USING (target_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TABLE public.player_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 match_id uuid NOT NULL REFERENCES public.matches(id),
 target_id uuid NOT NULL REFERENCES public.profiles(id),
 reporter_id uuid NOT NULL REFERENCES public.profiles(id),
 cycle integer NOT NULL,
 reason text NOT NULL,
 dismissed boolean NOT NULL DEFAULT false,
 verdict text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(match_id,target_id,reporter_id),
 UNIQUE(target_id,cycle,reporter_id)
);
GRANT ALL ON public.player_reports TO service_role;
ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX player_reports_target_cycle ON public.player_reports(target_id,cycle) WHERE NOT dismissed;
CREATE OR REPLACE FUNCTION public.report_ban_hours(p_strikes integer) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE WHEN p_strikes=1 THEN 1 WHEN p_strikes=2 THEN 6 ELSE NULL END $$;
CREATE OR REPLACE FUNCTION public.submit_player_report(p_match uuid,p_target uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.player_report_state; n integer; ended timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF p_target=auth.uid() THEN RAISE EXCEPTION 'Não é possível denunciar a si mesmo.'; END IF;
 IF length(trim(p_reason))<3 OR length(trim(p_reason))>1000 THEN RAISE EXCEPTION 'Informe um motivo entre 3 e 1000 caracteres.'; END IF;
 SELECT completed_at INTO ended FROM public.matches WHERE id=p_match AND status='completed';
 IF ended IS NULL OR NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=p_match AND user_id=auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=p_match AND user_id=p_target) THEN RAISE EXCEPTION 'Só participantes podem denunciar jogadores de uma partida concluída.'; END IF;
 PERFORM pg_advisory_xact_lock(52719,5);
 INSERT INTO public.player_report_state(target_id) VALUES(p_target) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM public.player_report_state WHERE target_id=p_target FOR UPDATE;
 IF s.banned_until>now() THEN RAISE EXCEPTION 'Este jogador já está punido neste ciclo.'; END IF;
 IF ended<s.eligible_since THEN RAISE EXCEPTION 'Esta partida é anterior ao retorno do jogador.'; END IF;
 INSERT INTO public.player_reports(match_id,target_id,reporter_id,cycle,reason) VALUES(p_match,p_target,auth.uid(),s.cycle,trim(p_reason)) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'Você já denunciou este jogador neste ciclo.'; END IF;
 SELECT count(*) INTO n FROM public.player_reports WHERE target_id=p_target AND cycle=s.cycle AND NOT dismissed;
 IF n>=7 THEN
  UPDATE public.player_report_state SET strikes=strikes+1,cycle=cycle+1,
   banned_until=CASE WHEN strikes+1>=3 THEN 'infinity'::timestamptz ELSE now()+make_interval(hours=>public.report_ban_hours(strikes+1)) END,
   eligible_since=CASE WHEN strikes+1>=3 THEN 'infinity'::timestamptz ELSE now()+make_interval(hours=>public.report_ban_hours(strikes+1)) END WHERE target_id=p_target;
  DELETE FROM public.queue WHERE user_id=p_target;
  INSERT INTO public.mod_actions(actor_id,action,target_user,target_match,reason) VALUES(p_target,'ban_automatico_denuncias',p_target,p_match,'Sete denúncias anônimas distintas; etapa '||(s.strikes+1));
 END IF;
 RETURN jsonb_build_object('submitted',true);
END $$;
REVOKE ALL ON FUNCTION public.submit_player_report(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_player_report(uuid,uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.report_queue_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.player_report_state WHERE target_id=NEW.user_id AND banned_until>now()) THEN RAISE EXCEPTION 'jogador_suspenso'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.report_queue_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER report_queue_guard BEFORE INSERT OR UPDATE ON public.queue FOR EACH ROW EXECUTE FUNCTION public.report_queue_guard();
CREATE OR REPLACE FUNCTION public.get_my_report_matches() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 RETURN jsonb_build_object('sanction',(SELECT jsonb_build_object('strikes',strikes,'bannedUntil',CASE WHEN banned_until='infinity' THEN 'permanent' ELSE banned_until::text END) FROM public.player_report_state WHERE target_id=auth.uid()),
 'matches',coalesce((SELECT jsonb_agg(x ORDER BY x."completedAt" DESC) FROM (SELECT m.id,m.completed_at AS "completedAt",
 (SELECT jsonb_agg(jsonb_build_object('userId',p.id,'name',p.name,'isMe',p.id=auth.uid(),'reported',EXISTS(SELECT 1 FROM public.player_reports r WHERE r.match_id=m.id AND r.target_id=p.id AND r.reporter_id=auth.uid()))) FROM public.match_players mp JOIN public.profiles p ON p.id=mp.user_id WHERE mp.match_id=m.id) AS players
 FROM public.matches m WHERE m.status='completed' AND EXISTS(SELECT 1 FROM public.match_players WHERE match_id=m.id AND user_id=auth.uid()) ORDER BY m.completed_at DESC LIMIT 10) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_my_report_matches() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_report_matches() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_admin_player_reports() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x.latest DESC) FROM (SELECT s.target_id AS "targetId",p.name,s.strikes,s.cycle,
 CASE WHEN s.banned_until='infinity' THEN 'permanent' ELSE s.banned_until::text END AS "bannedUntil",
 (SELECT count(*) FROM public.player_reports WHERE target_id=s.target_id AND cycle=s.cycle AND NOT dismissed) AS pending,
 (SELECT max(created_at) FROM public.player_reports WHERE target_id=s.target_id) AS latest,
 (SELECT jsonb_agg(jsonb_build_object('id',r.id,'matchId',r.match_id,'cycle',r.cycle,'reason',r.reason,'dismissed',r.dismissed,'verdict',r.verdict,'createdAt',r.created_at) ORDER BY r.created_at DESC) FROM public.player_reports r WHERE r.target_id=s.target_id) AS reports
 FROM public.player_report_state s JOIN public.profiles p ON p.id=s.target_id) x),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.get_admin_player_reports() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_player_reports() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.review_player_report(p_target uuid,p_report uuid,p_action text,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.player_report_state;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF length(trim(p_reason))<3 OR length(trim(p_reason))>1000 THEN RAISE EXCEPTION 'Informe o motivo do veredito.'; END IF;
 PERFORM pg_advisory_xact_lock(52719,5);
 SELECT * INTO s FROM public.player_report_state WHERE target_id=p_target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Jogador sem denúncias.'; END IF;
 IF p_action='lift' THEN
  UPDATE public.player_report_state SET strikes=greatest(0,strikes-CASE WHEN banned_until>now() THEN 1 ELSE 0 END),banned_until=NULL,cycle=cycle+1,eligible_since=now() WHERE target_id=p_target;
 ELSIF p_action IN ('dismiss','uphold') THEN
  UPDATE public.player_reports SET dismissed=(p_action='dismiss'),verdict=trim(p_reason) WHERE id=p_report AND target_id=p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Denúncia não encontrada.'; END IF;
 ELSE RAISE EXCEPTION 'Veredito inválido.'; END IF;
 INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'revisao_denuncia_'||p_action,p_target,trim(p_reason));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.review_player_report(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_player_report(uuid,uuid,text,text) TO authenticated,service_role;