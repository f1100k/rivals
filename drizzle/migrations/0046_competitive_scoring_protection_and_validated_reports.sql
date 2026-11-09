ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS average_a numeric, ADD COLUMN IF NOT EXISTS average_b numeric;
ALTER TABLE public.match_players ADD COLUMN IF NOT EXISTS competitive boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS base_delta integer, ADD COLUMN IF NOT EXISTS rating_after integer, ADD COLUMN IF NOT EXISTS protection_kind text, ADD COLUMN IF NOT EXISTS trolling_delta integer NOT NULL DEFAULT 0;
ALTER TABLE public.player_reports ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false;
CREATE TABLE public.point_protection_wallets(user_id uuid PRIMARY KEY REFERENCES public.profiles(id),daily_available boolean NOT NULL DEFAULT true,daily_next_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),rank_stock integer NOT NULL DEFAULT 0 CHECK(rank_stock>=0),highest_tier integer NOT NULL DEFAULT 0);
GRANT SELECT ON public.point_protection_wallets TO authenticated;
GRANT ALL ON public.point_protection_wallets TO service_role;
ALTER TABLE public.point_protection_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads protection wallet" ON public.point_protection_wallets FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.point_protection_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),match_id uuid REFERENCES public.matches(id),event text NOT NULL,event_key text NOT NULL,category text,points integer NOT NULL DEFAULT 0,stock_change integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,event,event_key));
GRANT SELECT ON public.point_protection_events TO authenticated;
GRANT ALL ON public.point_protection_events TO service_role;
ALTER TABLE public.point_protection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads protection history" ON public.point_protection_events FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE INDEX point_protection_events_owner_date ON public.point_protection_events(user_id,created_at DESC);
CREATE INDEX player_reports_pending_match ON public.player_reports(target_id,match_id) WHERE NOT dismissed;
-- Baseline existing named tiers; previous matches are never rescored or rewarded retroactively.
INSERT INTO public.point_protection_wallets(user_id,highest_tier) SELECT id,least(5,greatest(0,rating)/300) FROM public.profiles ON CONFLICT DO NOTHING;
INSERT INTO public.point_protection_events(user_id,event,event_key,category,stock_change) SELECT user_id,'daily_grant','initial','daily',1 FROM public.point_protection_wallets ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.refresh_point_wallet(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.point_protection_wallets; periods integer; added integer;
BEGIN
 INSERT INTO point_protection_wallets(user_id,highest_tier) SELECT id,least(5,greatest(0,rating)/300) FROM profiles WHERE id=p_user ON CONFLICT DO NOTHING;
 IF FOUND THEN INSERT INTO point_protection_events(user_id,event,event_key,category,stock_change) VALUES(p_user,'daily_grant','initial','daily',1) ON CONFLICT DO NOTHING; END IF;
 SELECT * INTO w FROM point_protection_wallets WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado.'; END IF;
 IF w.daily_next_at<=now() THEN
  periods:=floor(extract(epoch FROM now()-w.daily_next_at)/86400)::integer+1;
  added:=CASE WHEN w.daily_available THEN 0 ELSE 1 END;
  UPDATE point_protection_wallets SET daily_available=true,daily_next_at=w.daily_next_at+periods*interval '24 hours' WHERE user_id=p_user;
  INSERT INTO point_protection_events(user_id,event,event_key,category,stock_change) VALUES(p_user,'daily_grant',w.daily_next_at::text,'daily',added) ON CONFLICT DO NOTHING;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.refresh_point_wallet(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.finalize_match_gk(p_match uuid,p_a integer,p_b integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a numeric; b numeric; winner text; reward integer; r record; w point_protection_wallets; tier integer; t integer; bot_match boolean;
BEGIN
 PERFORM 1 FROM matches WHERE id=p_match AND status IN ('room','voting','reporting','disputed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'partida_ja_finalizada'; END IF;
 IF p_a IS NULL OR p_b IS NULL OR p_a=p_b THEN RAISE EXCEPTION 'empate_nao_permitido'; END IF;
 IF (SELECT count(*) FROM match_players WHERE match_id=p_match AND team='a')<>5 OR (SELECT count(*) FROM match_players WHERE match_id=p_match AND team='b')<>5 THEN RAISE EXCEPTION 'A partida precisa de dois times de cinco.'; END IF;
 PERFORM pg_advisory_xact_lock(52719,5);
 SELECT avg(rating_before) FILTER(WHERE team='a'),avg(rating_before) FILTER(WHERE team='b') INTO a,b FROM match_players WHERE match_id=p_match;
 SELECT EXISTS(SELECT 1 FROM match_players mp JOIN profiles pr ON pr.id=mp.user_id WHERE mp.match_id=p_match AND pr.is_ghost) INTO bot_match;
 winner:=CASE WHEN p_a>p_b THEN 'a' ELSE 'b' END;
 reward:=CASE WHEN (CASE WHEN winner='a' THEN a<b ELSE b<a END) THEN 28 ELSE 18 END;
 FOR r IN SELECT mp.*,pr.rating FROM match_players mp JOIN profiles pr ON pr.id=mp.user_id WHERE mp.match_id=p_match ORDER BY mp.user_id LOOP
  PERFORM refresh_point_wallet(r.user_id);
  IF bot_match THEN
   UPDATE match_players SET delta=0,base_delta=0,rating_after=r.rating,competitive=false WHERE match_id=p_match AND user_id=r.user_id;
  ELSE
   UPDATE match_players SET competitive=true,base_delta=CASE WHEN r.team=winner THEN reward ELSE -19 END,delta=CASE WHEN r.team=winner THEN reward ELSE -19 END,rating_after=r.rating+CASE WHEN r.team=winner THEN reward ELSE -19 END WHERE match_id=p_match AND user_id=r.user_id;
   UPDATE profiles SET rating=rating+CASE WHEN r.team=winner THEN reward ELSE -19 END,wins=wins+CASE WHEN r.team=winner THEN 1 ELSE 0 END,losses=losses+CASE WHEN r.team=winner THEN 0 ELSE 1 END WHERE id=r.user_id;
   SELECT * INTO w FROM point_protection_wallets WHERE user_id=r.user_id FOR UPDATE;
   tier:=least(5,greatest(0,r.rating+CASE WHEN r.team=winner THEN reward ELSE -19 END)/300);
   IF tier>w.highest_tier THEN
    FOR t IN (w.highest_tier+1)..tier LOOP
     INSERT INTO point_protection_events(user_id,match_id,event,event_key,category,stock_change) VALUES(r.user_id,p_match,'rank_grant',t::text,'rank',1) ON CONFLICT DO NOTHING;
     IF FOUND THEN UPDATE point_protection_wallets SET rank_stock=rank_stock+1 WHERE user_id=r.user_id; END IF;
    END LOOP;
    UPDATE point_protection_wallets SET highest_tier=tier WHERE user_id=r.user_id;
   END IF;
   INSERT INTO point_protection_events(user_id,match_id,event,event_key,points) VALUES(r.user_id,p_match,'match_result',p_match::text,CASE WHEN r.team=winner THEN reward ELSE -19 END);
  END IF;
 END LOOP;
 UPDATE matches SET average_a=a,average_b=b,score_a=p_a,score_b=p_b,status='completed',completed_at=now() WHERE id=p_match;
END $$;
REVOKE ALL ON FUNCTION public.finalize_match_gk(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_point_protection_state() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); result jsonb; w point_protection_wallets;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 PERFORM pg_advisory_xact_lock(52719,5);
 PERFORM refresh_point_wallet(u);
 SELECT * INTO w FROM point_protection_wallets WHERE user_id=u;
 SELECT jsonb_build_object('matchId',m.id,'completedAt',m.completed_at,'before',mp.rating_after-mp.delta,'after',mp.rating_after,'baseDelta',mp.base_delta,'delta',mp.delta,'averageA',m.average_a,'averageB',m.average_b,'protectionKind',mp.protection_kind,'trollingDelta',mp.trolling_delta,'blockedReason',CASE
 WHEN mp.base_delta>=0 THEN 'Proteção disponível somente após derrota.'
 WHEN mp.trolling_delta<>0 THEN 'Trollagem confirmada: proteção bloqueada.'
 WHEN mp.protection_kind IS NOT NULL THEN 'Proteção já utilizada nesta partida.'
 WHEN EXISTS(SELECT 1 FROM player_reports WHERE target_id=u AND match_id=m.id AND NOT dismissed AND verdict IS NULL) THEN 'Aguardando veredito das denúncias desta partida.'
 WHEN EXISTS(SELECT 1 FROM match_players next_mp JOIN matches next_m ON next_m.id=next_mp.match_id WHERE next_mp.user_id=u AND next_m.id<>m.id AND (next_m.created_at>=m.completed_at OR next_m.status IN ('draft','room','voting','reporting','disputed','ready','lobby'))) THEN 'Proteção expirada: outra partida já começou.'
 ELSE NULL END) INTO result FROM match_players mp JOIN matches m ON m.id=mp.match_id WHERE mp.user_id=u AND mp.competitive AND m.status='completed' ORDER BY m.completed_at DESC,m.id DESC LIMIT 1;
 RETURN jsonb_build_object('dailyAvailable',w.daily_available,'dailyNextAt',w.daily_next_at,'rankStock',w.rank_stock,'result',result,'history',coalesce((SELECT jsonb_agg(x ORDER BY x."createdAt" DESC) FROM (SELECT event,category,points,stock_change AS "stockChange",match_id AS "matchId",created_at AS "createdAt" FROM point_protection_events WHERE user_id=u ORDER BY created_at DESC,id DESC LIMIT 30) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_point_protection_state() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_point_protection_state() TO authenticated;
CREATE OR REPLACE FUNCTION public.activate_point_protection(p_match uuid,p_category text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); state jsonb; r match_players; w point_protection_wallets;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF p_category NOT IN ('daily','rank') OR p_category IS NULL THEN RAISE EXCEPTION 'Categoria inválida.'; END IF;
 PERFORM pg_advisory_xact_lock(52719,5);
 state:=get_point_protection_state();
 IF state->'result'->>'matchId' IS DISTINCT FROM p_match::text THEN RAISE EXCEPTION 'Somente a partida recém-finalizada pode ser protegida.'; END IF;
 IF state->'result'->>'blockedReason' IS NOT NULL THEN RAISE EXCEPTION '%',state->'result'->>'blockedReason'; END IF;
 SELECT * INTO r FROM match_players WHERE match_id=p_match AND user_id=u FOR UPDATE;
 SELECT * INTO w FROM point_protection_wallets WHERE user_id=u FOR UPDATE;
 IF p_category='daily' THEN
  IF NOT w.daily_available THEN RAISE EXCEPTION 'Proteção diária indisponível.'; END IF;
  UPDATE point_protection_wallets SET daily_available=false WHERE user_id=u;
 ELSE
  IF w.rank_stock<1 THEN RAISE EXCEPTION 'Sem ativadores por patente.'; END IF;
  UPDATE point_protection_wallets SET rank_stock=rank_stock-1 WHERE user_id=u;
 END IF;
 UPDATE profiles SET rating=rating-r.base_delta WHERE id=u;
 UPDATE match_players SET delta=delta-r.base_delta,rating_after=rating_after-r.base_delta,protection_kind=p_category WHERE match_id=p_match AND user_id=u;
 INSERT INTO point_protection_events(user_id,match_id,event,event_key,category,points,stock_change) VALUES(u,p_match,'protection_used',p_match::text,p_category,-r.base_delta,-1);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.activate_point_protection(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_point_protection(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.submit_player_report(p_match uuid,p_target uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s player_report_state; ended timestamptz; n integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF p_target=auth.uid() THEN RAISE EXCEPTION 'Não é possível denunciar a si mesmo.'; END IF;
 IF length(trim(p_reason))<20 OR length(trim(p_reason))>1000 THEN RAISE EXCEPTION 'Explique o comportamento intencional em 20 a 1000 caracteres.'; END IF;
 SELECT completed_at INTO ended FROM matches WHERE id=p_match AND status='completed';
 IF ended IS NULL OR NOT EXISTS(SELECT 1 FROM match_players WHERE match_id=p_match AND user_id=auth.uid()) OR NOT EXISTS(SELECT 1 FROM match_players WHERE match_id=p_match AND user_id=p_target) THEN RAISE EXCEPTION 'Só participantes podem denunciar jogadores de uma partida concluída.'; END IF;
 PERFORM pg_advisory_xact_lock(52719,5);
 INSERT INTO player_report_state(target_id) VALUES(p_target) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM player_report_state WHERE target_id=p_target FOR UPDATE;
 IF s.banned_until>now() THEN RAISE EXCEPTION 'Este jogador já está punido neste ciclo.'; END IF;
 IF ended<s.eligible_since THEN RAISE EXCEPTION 'Esta partida é anterior ao retorno do jogador.'; END IF;
 INSERT INTO player_reports(match_id,target_id,reporter_id,cycle,reason) VALUES(p_match,p_target,auth.uid(),s.cycle,trim(p_reason)) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'Você já denunciou este jogador neste ciclo.'; END IF;
 SELECT count(*) INTO n FROM player_reports WHERE target_id=p_target AND cycle=s.cycle AND NOT dismissed;
 RETURN jsonb_build_object('submitted',true,'awaitingValidation',n>=7);
END $$;
CREATE OR REPLACE FUNCTION public.review_player_report(p_target uuid,p_report uuid,p_action text,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s player_report_state; n integer; match_id_to_penalize uuid; r match_players; confirmed_now boolean;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF length(trim(p_reason))<3 OR length(trim(p_reason))>1000 THEN RAISE EXCEPTION 'Informe o motivo do veredito.'; END IF;
 PERFORM pg_advisory_xact_lock(52719,5);
 SELECT * INTO s FROM player_report_state WHERE target_id=p_target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Jogador sem denúncias.'; END IF;
 IF p_action='lift' THEN
  UPDATE player_report_state SET strikes=greatest(0,strikes-CASE WHEN banned_until>now() THEN 1 ELSE 0 END),banned_until=NULL,cycle=cycle+1,eligible_since=now() WHERE target_id=p_target;
 ELSIF p_action IN ('dismiss','uphold') THEN
  UPDATE player_reports SET dismissed=(p_action='dismiss'),confirmed=(p_action='uphold'),verdict=trim(p_reason) WHERE id=p_report AND target_id=p_target AND cycle=s.cycle RETURNING match_id INTO match_id_to_penalize;
  IF NOT FOUND THEN RAISE EXCEPTION 'Denúncia não encontrada no ciclo atual.'; END IF;
  SELECT count(DISTINCT reporter_id) INTO n FROM player_reports WHERE target_id=p_target AND cycle=s.cycle AND confirmed AND NOT dismissed;
  IF n>=7 THEN
   SELECT * INTO r FROM match_players WHERE match_id=match_id_to_penalize AND user_id=p_target FOR UPDATE;
   IF r.competitive AND r.trolling_delta=0 THEN
    PERFORM refresh_point_wallet(p_target);
    IF r.protection_kind IS NOT NULL THEN
     UPDATE profiles SET rating=rating+r.base_delta WHERE id=p_target;
     UPDATE match_players SET delta=delta+r.base_delta,rating_after=rating_after+r.base_delta,protection_kind=NULL WHERE match_id=match_id_to_penalize AND user_id=p_target;
     IF r.protection_kind='daily' THEN UPDATE point_protection_wallets SET daily_available=true WHERE user_id=p_target;
     ELSE UPDATE point_protection_wallets SET rank_stock=rank_stock+1 WHERE user_id=p_target; END IF;
     INSERT INTO point_protection_events(user_id,match_id,event,event_key,category,points,stock_change) VALUES(p_target,match_id_to_penalize,'protection_revoked',match_id_to_penalize::text,r.protection_kind,r.base_delta,1);
    END IF;
    UPDATE profiles SET rating=rating-9 WHERE id=p_target;
    UPDATE match_players SET delta=delta-9,rating_after=rating_after-9,trolling_delta=-9 WHERE match_id=match_id_to_penalize AND user_id=p_target;
    INSERT INTO point_protection_events(user_id,match_id,event,event_key,points) VALUES(p_target,match_id_to_penalize,'trolling_penalty',match_id_to_penalize::text,-9);
   END IF;
   UPDATE player_report_state SET strikes=strikes+1,cycle=cycle+1,banned_until=CASE WHEN strikes+1>=3 THEN 'infinity'::timestamptz ELSE now()+make_interval(hours=>report_ban_hours(strikes+1)) END,eligible_since=CASE WHEN strikes+1>=3 THEN 'infinity'::timestamptz ELSE now()+make_interval(hours=>report_ban_hours(strikes+1)) END WHERE target_id=p_target;
   DELETE FROM queue WHERE user_id=p_target;
   INSERT INTO mod_actions(actor_id,action,target_user,target_match,reason) VALUES(auth.uid(),'trollagem_confirmada',p_target,match_id_to_penalize,'Sete concordâncias validadas. '||trim(p_reason));
  END IF;
 ELSE RAISE EXCEPTION 'Veredito inválido.'; END IF;
 INSERT INTO mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'revisao_denuncia_'||p_action,p_target,trim(p_reason));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.submit_player_report(uuid,uuid,text),public.review_player_report(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_player_report(uuid,uuid,text),public.review_player_report(uuid,uuid,text,text) TO authenticated;