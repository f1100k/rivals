-- Feature permissions granted by admins
CREATE TABLE public.user_feature_grants (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('banner','shop')),
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature)
);
GRANT SELECT ON public.user_feature_grants TO authenticated;
GRANT ALL ON public.user_feature_grants TO service_role;
ALTER TABLE public.user_feature_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono ou admin veem permissoes" ON public.user_feature_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_feature(_user_id uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (public.has_role(_user_id, 'admin')
    OR EXISTS (SELECT 1 FROM public.user_feature_grants WHERE user_id = _user_id AND feature = _feature))
$$;
REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated;

-- Player notifications
CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_notifications_user_created_idx ON public.user_notifications (user_id, created_at DESC);
GRANT SELECT ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono ve suas notificacoes" ON public.user_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;

CREATE OR REPLACE FUNCTION public.notify_user(p_user uuid, p_kind text, p_title text, p_body text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.user_notifications(user_id, kind, title, body) VALUES (p_user, p_kind, p_title, p_body)
$$;
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'nao_autenticado'; END IF;
  UPDATE public.user_notifications SET read_at = now() WHERE user_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.mark_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_feature(p_user uuid, p_feature text, p_on boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; v_label text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_feature NOT IN ('banner','shop') THEN RAISE EXCEPTION 'funcionalidade_invalida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND NOT is_ghost) THEN RAISE EXCEPTION 'invalid_player'; END IF;
  v_label := CASE p_feature WHEN 'banner' THEN 'Banner personalizado' ELSE 'Acesso à Loja' END;
  IF p_on THEN
    INSERT INTO public.user_feature_grants(user_id, feature, granted_by) VALUES (p_user, p_feature, auth.uid()) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_feature_grants WHERE user_id = p_user AND feature = p_feature;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    INSERT INTO public.mod_actions(actor_id, action, target_user, reason)
      VALUES (auth.uid(), CASE WHEN p_on THEN 'feature_granted' ELSE 'feature_revoked' END, p_user, p_feature);
    IF p_on THEN PERFORM public.notify_user(p_user, 'feature', 'Nova funcionalidade liberada', v_label || ' foi liberado para você.'); END IF;
  END IF;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_feature(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_feature(uuid, text, boolean) TO authenticated;

-- Banner: admins or players with the banner permission may set one
CREATE OR REPLACE FUNCTION public.guard_profile_banner_staff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.banner_url IS DISTINCT FROM OLD.banner_url AND NEW.banner_url IS NOT NULL
     AND NOT public.has_feature(auth.uid(), 'banner') THEN
    RAISE EXCEPTION 'banner restrito';
  END IF;
  RETURN NEW;
END $$;
COMMENT ON COLUMN public.profiles.banner_url IS 'Public profile banner storage path; only admins or players granted the banner feature may set one (guard_profile_banner_staff).';

-- Shop: admins or players with the shop permission
CREATE OR REPLACE FUNCTION public.buy_shop_item(p_item text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_item public.shop_items; v_bal integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_feature(auth.uid(),'shop') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_invalido'; END IF;
  INSERT INTO public.coin_wallets(user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  SELECT balance INTO v_bal FROM public.coin_wallets WHERE user_id = auth.uid() FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.shop_purchases WHERE user_id = auth.uid() AND item_id = p_item) THEN RAISE EXCEPTION 'ja_comprado'; END IF;
  IF v_bal < v_item.price THEN RAISE EXCEPTION 'saldo_insuficiente'; END IF;
  UPDATE public.coin_wallets SET balance = balance - v_item.price, updated_at = now() WHERE user_id = auth.uid() RETURNING balance INTO v_bal;
  INSERT INTO public.shop_purchases(user_id,item_id,price) VALUES (auth.uid(),p_item,v_item.price);
  IF v_item.kind = 'frame' THEN
    INSERT INTO public.avatar_frame_access(user_id,frame) VALUES (auth.uid(),p_item) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES (auth.uid(),'loja_compra',auth.uid(),p_item||' ('||v_item.price||' moedas)');
  RETURN v_bal;
END; $function$;

-- Inventory grants now notify the player
CREATE OR REPLACE FUNCTION public.admin_grant_inventory(p_user uuid, p_kind text, p_amount integer, p_frame text, p_reason text, p_request uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_frame_name text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_request IS NULL OR p_amount IS NULL OR p_amount<1 OR p_amount>100000 OR length(trim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 PERFORM public.lock_competitive_player(p_user);
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND NOT is_ghost) THEN RAISE EXCEPTION 'invalid_player'; END IF;
 IF EXISTS(SELECT 1 FROM public.mod_actions WHERE actor_id=auth.uid() AND action='grant_inventory' AND reason LIKE p_request::text || ' %') THEN RETURN false; END IF;
 CASE p_kind
 WHEN 'frame' THEN
   IF p_frame IS NULL OR NOT public.valid_avatar_frame(p_frame) THEN RAISE EXCEPTION 'invalid_frame'; END IF;
   INSERT INTO public.avatar_frame_access(user_id,frame) VALUES(p_user,p_frame) ON CONFLICT DO NOTHING;
   v_frame_name := coalesce((SELECT name FROM public.custom_avatar_frames WHERE id=p_frame),(SELECT name FROM public.shop_items WHERE id=p_frame), 'nova moldura');
   PERFORM public.notify_user(p_user,'frame','Você recebeu uma moldura','Moldura "'||v_frame_name||'" liberada no seu perfil.');
 WHEN 'coins' THEN
   INSERT INTO public.coin_wallets(user_id,balance) VALUES(p_user,p_amount) ON CONFLICT(user_id) DO UPDATE SET balance=coin_wallets.balance+excluded.balance,updated_at=now();
   PERFORM public.notify_user(p_user,'coins','Você recebeu moedas','+'||p_amount::text||' moedas na sua carteira.');
 WHEN 'protection' THEN
   PERFORM public.refresh_point_wallet(p_user);
   UPDATE public.point_protection_wallets SET rank_stock=rank_stock+p_amount WHERE user_id=p_user;
   INSERT INTO public.point_protection_events(user_id,event,event_key,category,points,stock_change) VALUES(p_user,'admin_grant','admin:'||p_request::text,'rank',0,p_amount);
   PERFORM public.notify_user(p_user,'protection','Você recebeu protetor de pontos','+'||p_amount::text||CASE WHEN p_amount=1 THEN ' protetor de pontos.' ELSE ' protetores de pontos.' END);
 ELSE RAISE EXCEPTION 'invalid_kind'; END CASE;
 INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'grant_inventory',p_user,p_request::text||' '||p_kind||' '||p_amount::text||' '||coalesce(p_frame,'')||' '||trim(p_reason));
 RETURN true; END $function$;

-- Special tag effects (e.g. glowing green supporter tag)
ALTER TABLE public.profile_tags ADD COLUMN effect text NOT NULL DEFAULT 'none' CHECK (effect IN ('none','glow-green'));

DROP FUNCTION IF EXISTS public.admin_save_profile_tag(uuid, text, text, text);
CREATE FUNCTION public.admin_save_profile_tag(p_id uuid, p_name text, p_text text, p_background text, p_effect text DEFAULT 'none')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$ DECLARE v uuid; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente admins.'; END IF;
INSERT INTO public.profile_tags(id,name,text_color,background_color,effect,created_by) VALUES(coalesce(p_id,gen_random_uuid()),trim(p_name),p_text,p_background,coalesce(p_effect,'none'),auth.uid())
ON CONFLICT(id) DO UPDATE SET name=excluded.name,text_color=excluded.text_color,background_color=excluded.background_color,effect=excluded.effect RETURNING id INTO v;
INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'profile_tag_saved',v::text||': '||trim(p_name)); RETURN v; END $function$;
REVOKE ALL ON FUNCTION public.admin_save_profile_tag(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_profile_tag(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_equipped_profile_tags()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',t.name,'text_color',t.text_color,'background_color',t.background_color,'effect',t.effect)),'[]'::jsonb)
FROM public.player_profile_tags p JOIN public.profile_tags t ON t.id=p.tag_id WHERE p.equipped $function$;

-- Tag grants now notify the player
CREATE OR REPLACE FUNCTION public.admin_grant_profile_tag(p_tag uuid, p_users uuid[], p_remove boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$ DECLARE n integer; v_name text; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente admins.'; END IF;
SELECT name INTO v_name FROM public.profile_tags WHERE id=p_tag;
IF NOT FOUND THEN RAISE EXCEPTION 'Tag inexistente.'; END IF;
IF p_remove THEN
  DELETE FROM public.player_profile_tags WHERE tag_id=p_tag AND user_id=ANY(p_users);
  GET DIAGNOSTICS n=ROW_COUNT;
ELSE
  WITH ins AS (
    INSERT INTO public.player_profile_tags(user_id,tag_id,granted_by)
    SELECT id,p_tag,auth.uid() FROM public.profiles WHERE id=ANY(p_users) AND NOT is_ghost ON CONFLICT DO NOTHING RETURNING user_id)
  INSERT INTO public.user_notifications(user_id,kind,title,body)
  SELECT user_id,'tag','Você recebeu um título','Título "'||v_name||'" disponível em Perfil → Meus títulos.' FROM ins;
  GET DIAGNOSTICS n=ROW_COUNT;
END IF;
INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),CASE WHEN p_remove THEN 'profile_tag_revoked' ELSE 'profile_tag_granted' END,p_tag::text||': '||array_to_string(p_users,',')); RETURN n; END $function$;

-- Likes: allowed from the result screen once teams are set (not only after completion)
CREATE OR REPLACE FUNCTION public.like_player(p_match uuid, p_target uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_me uuid := auth.uid(); v_my_team text; v_their_team text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'nao_autenticado'; END IF;
  IF v_me = p_target THEN RAISE EXCEPTION 'Você não pode curtir a si mesmo.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match AND status IN ('room','voting','reporting','disputed','completed')) THEN
    RAISE EXCEPTION 'As curtidas abrem quando os times estiverem formados.'; END IF;
  SELECT team INTO v_my_team FROM match_players WHERE match_id = p_match AND user_id = v_me;
  SELECT mp.team INTO v_their_team FROM match_players mp JOIN profiles p ON p.id = mp.user_id
    WHERE mp.match_id = p_match AND mp.user_id = p_target AND NOT p.is_ghost;
  IF v_my_team IS NULL OR v_their_team IS NULL OR lower(v_my_team) <> lower(v_their_team) THEN
    RAISE EXCEPTION 'Só é possível curtir companheiros do seu time.'; END IF;
  INSERT INTO player_likes(giver_id, target_id, match_id) VALUES (v_me, p_target, p_match)
    ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $function$;

CREATE OR REPLACE FUNCTION public.get_my_liked_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(target_id), '{}') FROM public.player_likes WHERE giver_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_my_liked_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_liked_ids() TO authenticated;