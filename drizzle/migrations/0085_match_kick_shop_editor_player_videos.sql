CREATE TABLE public.match_kick_votes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
 target_id uuid NOT NULL, started_by uuid NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz NOT NULL DEFAULT (now()+interval '20 seconds'), status text NOT NULL DEFAULT 'active',
 CHECK(status IN ('active','approved','rejected','cancelled'))
);
GRANT SELECT ON public.match_kick_votes TO authenticated;
GRANT ALL ON public.match_kick_votes TO service_role;
ALTER TABLE public.match_kick_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY kick_read ON public.match_kick_votes FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.match_players WHERE match_id=match_kick_votes.match_id AND user_id=auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE UNIQUE INDEX one_active_kick ON public.match_kick_votes(match_id) WHERE status='active';
CREATE TABLE public.match_kick_ballots (vote_id uuid NOT NULL REFERENCES public.match_kick_votes(id) ON DELETE CASCADE, user_id uuid NOT NULL, approve boolean NOT NULL, PRIMARY KEY(vote_id,user_id));
GRANT SELECT ON public.match_kick_ballots TO authenticated;
GRANT ALL ON public.match_kick_ballots TO service_role;
ALTER TABLE public.match_kick_ballots ENABLE ROW LEVEL SECURITY;
CREATE POLICY ballot_read ON public.match_kick_ballots FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.match_kick_votes v JOIN public.match_players p ON p.match_id=v.match_id WHERE v.id=vote_id AND p.user_id=auth.uid()));
CREATE TABLE public.match_replacements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
 removed_id uuid NOT NULL, replacement_id uuid, team text, position text, was_captain boolean NOT NULL DEFAULT false,
 removed_player jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), replaced_at timestamptz
);
GRANT SELECT ON public.match_replacements TO authenticated;
GRANT ALL ON public.match_replacements TO service_role;
ALTER TABLE public.match_replacements ENABLE ROW LEVEL SECURITY;
CREATE POLICY replacement_read ON public.match_replacements FOR SELECT TO authenticated USING(removed_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.match_players p WHERE p.match_id=match_replacements.match_id AND p.user_id=auth.uid()));
CREATE INDEX pending_replacement ON public.match_replacements(match_id,created_at) WHERE replacement_id IS NULL;
ALTER TABLE public.matches ADD COLUMN had_bots boolean NOT NULL DEFAULT false;
UPDATE public.matches m SET had_bots=true WHERE EXISTS(SELECT 1 FROM public.match_players mp JOIN public.profiles p ON p.id=mp.user_id WHERE mp.match_id=m.id AND p.is_ghost);
CREATE FUNCTION public.remember_match_bot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND is_ghost) THEN UPDATE public.matches SET had_bots=true WHERE id=NEW.match_id; END IF; RETURN NEW; END $$;
CREATE TRIGGER remember_match_bot AFTER INSERT ON public.match_players FOR EACH ROW EXECUTE FUNCTION public.remember_match_bot();
CREATE FUNCTION public.kick_match_paused(p_match uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.match_kick_votes WHERE match_id=p_match AND status='active') OR EXISTS(SELECT 1 FROM public.match_replacements WHERE match_id=p_match AND replacement_id IS NULL) $$;
REVOKE ALL ON FUNCTION public.kick_match_paused(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kick_match_paused(uuid) TO authenticated,service_role;
CREATE FUNCTION public.backfill_match_gk(p_match uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.matches; vacancy public.match_replacements; q public.queue; cap uuid;
BEGIN
 SELECT * INTO m FROM public.matches WHERE id=p_match AND status IN('draft','room','voting','reporting','disputed') FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT pg_try_advisory_xact_lock(52719,CASE WHEN m.region='TESTE' THEN 16 ELSE 6 END) THEN RETURN; END IF;
 FOR vacancy IN SELECT * FROM public.match_replacements WHERE match_id=p_match AND replacement_id IS NULL ORDER BY created_at,id FOR UPDATE LOOP
  SELECT * INTO q FROM public.queue waiting WHERE (waiting.region='TESTE')=(m.region='TESTE')
   AND NOT EXISTS(SELECT 1 FROM public.match_players mp JOIN public.matches current_match ON current_match.id=mp.match_id WHERE mp.user_id=waiting.user_id AND current_match.status IN('ready','lobby','draft','room','voting','reporting','disputed'))
   AND NOT EXISTS(SELECT 1 FROM public.match_replacements r WHERE r.match_id=p_match AND r.removed_id=waiting.user_id)
   ORDER BY waiting.joined_at,waiting.id LIMIT 1 FOR UPDATE OF waiting SKIP LOCKED;
  IF NOT FOUND THEN EXIT; END IF;
  INSERT INTO public.match_players(match_id,user_id,team,position,rating_before) SELECT p_match,q.user_id,vacancy.team,vacancy.position,rating FROM public.profiles WHERE id=q.user_id;
  DELETE FROM public.queue WHERE id=q.id;
  UPDATE public.match_replacements SET replacement_id=q.user_id,replaced_at=now() WHERE id=vacancy.id;
  IF vacancy.was_captain THEN
   UPDATE public.matches SET captain_a=CASE WHEN vacancy.team='a' THEN q.user_id ELSE captain_a END,captain_b=CASE WHEN vacancy.team='b' THEN q.user_id ELSE captain_b END WHERE id=p_match;
  END IF;
 END LOOP;
 IF NOT public.kick_match_paused(p_match) THEN UPDATE public.matches SET deadline=now()+interval '30 seconds' WHERE id=p_match AND status='draft'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.backfill_match_gk(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_match_gk(uuid) TO service_role;
CREATE FUNCTION public.resolve_match_kick_gk(p_match uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.match_kick_votes; m public.matches; target public.match_players; yes_votes integer; no_votes integer;
BEGIN
 SELECT * INTO m FROM public.matches WHERE id=p_match FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO v FROM public.match_kick_votes WHERE match_id=p_match AND status='active' FOR UPDATE;
 IF FOUND AND (m.status NOT IN('draft','room','voting','reporting','disputed') OR v.ends_at<=now()) THEN
  IF m.status NOT IN('draft','room','voting','reporting','disputed') THEN UPDATE public.match_kick_votes SET status='cancelled' WHERE id=v.id;
  ELSE
   SELECT count(*) FILTER(WHERE b.approve),count(*) FILTER(WHERE NOT b.approve) INTO yes_votes,no_votes FROM public.match_kick_ballots b JOIN public.match_players p ON p.match_id=p_match AND p.user_id=b.user_id WHERE b.vote_id=v.id AND b.user_id<>v.target_id;
   IF yes_votes>no_votes THEN
    SELECT * INTO target FROM public.match_players WHERE match_id=p_match AND user_id=v.target_id;
    IF FOUND THEN
     INSERT INTO public.match_replacements(match_id,removed_id,team,position,was_captain,removed_player) VALUES(p_match,target.user_id,target.team,target.position,target.user_id IN(m.captain_a,m.captain_b),to_jsonb(target));
     DELETE FROM public.match_player_stats WHERE match_id=p_match AND user_id=target.user_id;
     DELETE FROM public.match_players WHERE match_id=p_match AND user_id=target.user_id;
     UPDATE public.match_players SET vote=NULL,cancel_vote=false,shot_vote=NULL WHERE match_id=p_match;
     UPDATE public.matches SET shot_approved=false WHERE id=p_match AND shot_by IS NOT NULL;
     INSERT INTO public.mod_actions(actor_id,action,target_user,target_match,reason) VALUES(v.started_by,'expulsao_por_votacao',target.user_id,p_match,yes_votes||' sim / '||no_votes||' não');
    END IF;
    UPDATE public.match_kick_votes SET status='approved' WHERE id=v.id;
   ELSE UPDATE public.match_kick_votes SET status='rejected' WHERE id=v.id; END IF;
  END IF;
  IF m.status='draft' THEN UPDATE public.matches SET deadline=now()+interval '30 seconds' WHERE id=p_match; END IF;
 END IF;
 PERFORM public.backfill_match_gk(p_match);
END $$;
REVOKE ALL ON FUNCTION public.resolve_match_kick_gk(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_match_kick_gk(uuid) TO service_role;
CREATE FUNCTION public.start_match_kick_gk(p_match uuid,p_target uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE vote_id uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.uid()=p_target THEN RAISE EXCEPTION 'Não é possível votar para expulsar a si mesmo.'; END IF;
 PERFORM 1 FROM public.matches WHERE id=p_match AND status IN('draft','room','voting','reporting','disputed') FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=p_match AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Partida indisponível.'; END IF;
 PERFORM public.resolve_match_kick_gk(p_match);
 IF NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=p_match AND user_id=p_target) THEN RAISE EXCEPTION 'Jogador indisponível.'; END IF;
 SELECT id INTO vote_id FROM public.match_kick_votes WHERE match_id=p_match AND status='active';
 IF vote_id IS NOT NULL THEN RETURN vote_id; END IF;
 INSERT INTO public.match_kick_votes(match_id,target_id,started_by) VALUES(p_match,p_target,auth.uid()) RETURNING id INTO vote_id;
 RETURN vote_id;
END $$;
REVOKE ALL ON FUNCTION public.start_match_kick_gk(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_match_kick_gk(uuid,uuid) TO authenticated,service_role;
CREATE FUNCTION public.cast_match_kick_gk(p_vote uuid,p_yes boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.match_kick_votes;
BEGIN
 SELECT * INTO v FROM public.match_kick_votes WHERE id=p_vote;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Votação indisponível.'; END IF;
 PERFORM 1 FROM public.matches WHERE id=v.match_id FOR UPDATE;
 IF auth.uid() IS NULL OR auth.uid()=v.target_id OR NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=v.match_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Sem permissão para votar.'; END IF;
 IF v.status<>'active' OR v.ends_at<=now() THEN PERFORM public.resolve_match_kick_gk(v.match_id); RETURN false; END IF;
 IF p_yes IS NULL THEN RAISE EXCEPTION 'Voto inválido.'; END IF;
 INSERT INTO public.match_kick_ballots(vote_id,user_id,approve) VALUES(p_vote,auth.uid(),p_yes) ON CONFLICT(vote_id,user_id) DO UPDATE SET approve=EXCLUDED.approve;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cast_match_kick_gk(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cast_match_kick_gk(uuid,boolean) TO authenticated,service_role;
DO $patch$
DECLARE definition text; name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['draft_tick','draft_assign','ghost_autopick'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name LIMIT 1;
  definition:=regexp_replace(definition,'BEGIN','BEGIN IF public.kick_match_paused(p_match) THEN RETURN; END IF;'); EXECUTE definition;
 END LOOP;
 SELECT pg_get_functiondef('public.finalize_match_gk(uuid,integer,integer)'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,'BEGIN','BEGIN IF public.kick_match_paused(p_match) THEN RAISE EXCEPTION ''Aguarde a votação de expulsão ou o substituto.''; END IF;');
 definition:=replace(definition,'OR EXISTS(SELECT 1 FROM public.matches WHERE id = p_match AND region = ''TESTE'')','OR EXISTS(SELECT 1 FROM public.matches WHERE id = p_match AND (region = ''TESTE'' OR had_bots))'); EXECUTE definition;
 SELECT pg_get_functiondef('public.try_matchmake_pool_gk(boolean)'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,'BEGIN','BEGIN PERFORM public.backfill_match_gk(id) FROM public.matches WHERE (region=''TESTE'')=p_test AND status IN(''draft'',''room'',''voting'',''reporting'',''disputed'') AND EXISTS(SELECT 1 FROM public.match_replacements r WHERE r.match_id=matches.id AND r.replacement_id IS NULL);'); EXECUTE definition;
 SELECT pg_get_functiondef('public.purge_finished_bot_matches()'::regprocedure) INTO definition;
 definition:=replace(definition,'WHERE p.is_ghost AND m.status IN (''completed'',''cancelled'')','WHERE (p.is_ghost OR m.had_bots) AND m.status IN (''completed'',''cancelled'')');
 definition:=replace(definition,'DELETE FROM match_players WHERE match_id = ANY(v_matches);','SELECT array_agg(DISTINCT removed_id) || v_bots INTO v_bots FROM public.match_replacements r JOIN public.profiles p ON p.id=r.removed_id WHERE r.match_id=ANY(v_matches) AND p.is_ghost; v_bots:=coalesce(v_bots,''{}''); DELETE FROM match_players WHERE match_id = ANY(v_matches);'); EXECUTE definition;
END $patch$;
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
  SELECT jsonb_build_object('id',v.id,'targetId',v.target_id,'targetName',(SELECT name FROM public.profiles WHERE id=v.target_id),'endsAt',v.ends_at,'yes',(SELECT count(*) FROM public.match_kick_ballots WHERE vote_id=v.id AND approve),'no',(SELECT count(*) FROM public.match_kick_ballots WHERE vote_id=v.id AND NOT approve),'myVote',(SELECT approve FROM public.match_kick_ballots WHERE vote_id=v.id AND user_id=auth.uid())) INTO v_kick FROM public.match_kick_votes v WHERE match_id=m_id AND status='active';
  v_state:=jsonb_set(v_state,'{match,kick}',coalesce(v_kick,'null'::jsonb));
  v_state:=jsonb_set(v_state,'{match,vacancies}',to_jsonb((SELECT count(*) FROM public.match_replacements WHERE match_id=m_id AND replacement_id IS NULL)));
 END IF;
 SELECT jsonb_build_object('id',r.id,'matchId',r.match_id) INTO v_removal FROM public.match_replacements r WHERE removed_id=auth.uid() ORDER BY created_at DESC LIMIT 1;
 v_state:=v_state||jsonb_build_object('lastRemoval',v_removal);
 RETURN json_build_object('state',v_state,'draft',v_draft);
END $$;
CREATE TABLE public.shop_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),display_limit integer NOT NULL DEFAULT 100 CHECK(display_limit BETWEEN 0 AND 1000));
GRANT SELECT ON public.shop_settings TO authenticated; GRANT ALL ON public.shop_settings TO service_role;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_read ON public.shop_settings FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.admin_save_shop_item(p_id text,p_name text,p_price integer,p_active boolean,p_sort integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 IF length(trim(p_name)) NOT BETWEEN 2 AND 60 OR p_price NOT BETWEEN 0 AND 100000 OR p_sort NOT BETWEEN 0 AND 100000 OR p_active IS NULL THEN RAISE EXCEPTION 'Item inválido.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shop_items WHERE id=p_id) AND NOT public.valid_avatar_frame(p_id) THEN RAISE EXCEPTION 'Cadastre a moldura primeiro.'; END IF;
 IF p_active AND p_id LIKE 'custom-%' AND NOT public.valid_avatar_frame(p_id) THEN RAISE EXCEPTION 'Esta moldura foi apagada do site.'; END IF;
 INSERT INTO public.shop_items(id,name,kind,price,active,sort) VALUES(p_id,trim(p_name),'frame',p_price,p_active,p_sort) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,price=EXCLUDED.price,active=EXCLUDED.active,sort=EXCLUDED.sort;
 INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'loja_item_editado',p_id||': '||p_name||', '||p_price||' moedas, visível='||p_active);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_save_shop_item(text,text,integer,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_shop_item(text,text,integer,boolean,integer) TO authenticated,service_role;
CREATE FUNCTION public.admin_set_shop_limit(p_limit integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 IF p_limit NOT BETWEEN 0 AND 1000 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;
 INSERT INTO public.shop_settings(id,display_limit) VALUES(true,p_limit) ON CONFLICT(id) DO UPDATE SET display_limit=EXCLUDED.display_limit;
 INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'loja_limite_editado',p_limit::text); RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_shop_limit(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_shop_limit(integer) TO authenticated,service_role;
CREATE TABLE public.player_videos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL,object_path text NOT NULL UNIQUE,all_players boolean NOT NULL DEFAULT false,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),active boolean NOT NULL DEFAULT true);
GRANT SELECT ON public.player_videos TO authenticated; GRANT ALL ON public.player_videos TO service_role;
ALTER TABLE public.player_videos ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.player_video_recipients(video_id uuid NOT NULL REFERENCES public.player_videos(id) ON DELETE CASCADE,user_id uuid NOT NULL,PRIMARY KEY(video_id,user_id));
GRANT SELECT ON public.player_video_recipients TO authenticated; GRANT ALL ON public.player_video_recipients TO service_role;
ALTER TABLE public.player_video_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipients_read ON public.player_video_recipients FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY video_read ON public.player_videos FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin') OR (active AND (all_players OR EXISTS(SELECT 1 FROM public.player_video_recipients WHERE video_id=player_videos.id AND user_id=auth.uid()))));
CREATE TABLE public.player_video_views(video_id uuid NOT NULL REFERENCES public.player_videos(id) ON DELETE CASCADE,user_id uuid NOT NULL,viewed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(video_id,user_id));
GRANT SELECT,INSERT ON public.player_video_views TO authenticated; GRANT ALL ON public.player_video_views TO service_role;
ALTER TABLE public.player_video_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY views_read ON public.player_video_views FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY views_insert ON public.player_video_views FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.player_videos WHERE id=video_id AND active));
CREATE POLICY video_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='player-videos' AND (public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.player_videos WHERE object_path=storage.objects.name AND active AND (all_players OR EXISTS(SELECT 1 FROM public.player_video_recipients WHERE video_id=player_videos.id AND user_id=auth.uid())))));
CREATE POLICY video_storage_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='player-videos' AND public.has_role(auth.uid(),'admin') AND (storage.foldername(name))[1]=auth.uid()::text AND lower(storage.extension(name)) IN('mp4','webm'));
CREATE POLICY video_storage_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='player-videos' AND public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.admin_publish_video(p_title text,p_path text,p_all boolean,p_users uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 IF length(trim(p_title)) NOT BETWEEN 2 AND 100 OR p_all IS NULL OR split_part(p_path,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='player-videos' AND name=p_path) THEN RAISE EXCEPTION 'Vídeo inválido.'; END IF;
 IF NOT p_all AND coalesce(cardinality(p_users),0)=0 THEN RAISE EXCEPTION 'Escolha os destinatários.'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_users) u WHERE NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND NOT is_ghost)) THEN RAISE EXCEPTION 'Destinatário inválido.'; END IF;
 INSERT INTO public.player_videos(title,object_path,all_players,created_by) VALUES(trim(p_title),p_path,p_all,auth.uid()) RETURNING id INTO v_id;
 IF NOT p_all THEN INSERT INTO public.player_video_recipients(video_id,user_id) SELECT DISTINCT v_id,u FROM unnest(p_users) u; END IF;
 INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'video_publicado',p_title||': '||CASE WHEN p_all THEN 'todos' ELSE cardinality(p_users)::text||' jogadores' END);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_publish_video(text,text,boolean,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_video(text,text,boolean,uuid[]) TO authenticated,service_role;
CREATE FUNCTION public.admin_remove_video(p_video uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE path text; BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 UPDATE public.player_videos SET active=false WHERE id=p_video RETURNING object_path INTO path;
 IF path IS NULL THEN RAISE EXCEPTION 'Vídeo indisponível.'; END IF;
 INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'video_apagado',p_video::text); RETURN path;
END $$;
REVOKE ALL ON FUNCTION public.admin_remove_video(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_video(uuid) TO authenticated,service_role;