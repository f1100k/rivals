CREATE TABLE public.custom_avatar_frames (id text PRIMARY KEY CHECK (id ~ '^custom-[a-f0-9-]+$' AND length(id)<=40), name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60), image_path text NOT NULL, public_access boolean NOT NULL DEFAULT true, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.custom_avatar_frames TO anon, authenticated;
GRANT ALL ON public.custom_avatar_frames TO service_role;
ALTER TABLE public.custom_avatar_frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read approved frame catalog" ON public.custom_avatar_frames FOR SELECT USING (true);
ALTER TABLE public.avatar_frames ADD COLUMN frame_key text;
COMMENT ON COLUMN public.avatar_frames.frame_key IS 'Authoritative equipped frame ID for built-in and uploaded frames; frame retained for legacy compatibility.';
CREATE POLICY "read frame artwork" ON storage.objects FOR SELECT USING (bucket_id='frame-art');
CREATE POLICY "admins upload frame artwork" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='frame-art' AND public.has_role(auth.uid(),'admin') AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "admins remove own unused artwork" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='frame-art' AND public.has_role(auth.uid(),'admin') AND (storage.foldername(name))[1]=auth.uid()::text AND NOT EXISTS (SELECT 1 FROM public.custom_avatar_frames WHERE image_path=name));
CREATE FUNCTION public.valid_avatar_frame(p_frame text) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$ SELECT p_frame IN ('coroa-fogo','dragao-roxo','coroa-fumaca','gelo-cristal','lua-vermelha','corrente-roxa','leao-dourado','guerreiro-roxo','natureza','demonio-roxo','neon-roxo') OR EXISTS(SELECT 1 FROM public.custom_avatar_frames WHERE id=p_frame); $$;
GRANT EXECUTE ON FUNCTION public.valid_avatar_frame(text) TO authenticated;
CREATE FUNCTION public.admin_publish_frame(p_id text,p_name text,p_path text,p_public boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_path NOT LIKE auth.uid()::text || '/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='frame-art' AND name=p_path) THEN RAISE EXCEPTION 'invalid_image'; END IF;
 INSERT INTO public.custom_avatar_frames(id,name,image_path,public_access,created_by) VALUES(p_id,trim(p_name),p_path,p_public,auth.uid());
 INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'publish_frame',p_id||' '||trim(p_name)); RETURN true; END $$;
REVOKE ALL ON FUNCTION public.admin_publish_frame(text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_frame(text,text,text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_admin_avatar_frame(p_frame text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_frame IS NULL THEN DELETE FROM public.avatar_frames WHERE user_id=auth.uid(); ELSE
 IF NOT public.valid_avatar_frame(p_frame) THEN RAISE EXCEPTION 'invalid_frame'; END IF;
 IF NOT public.has_role(auth.uid(),'admin') AND NOT EXISTS(SELECT 1 FROM public.avatar_frame_access WHERE user_id=auth.uid() AND frame=p_frame) AND NOT EXISTS(SELECT 1 FROM public.custom_avatar_frames WHERE id=p_frame AND public_access) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 INSERT INTO public.avatar_frames(user_id,frame,frame_key) VALUES(auth.uid(),CASE WHEN p_frame LIKE 'custom-%' THEN 'coroa-fogo' ELSE p_frame END,p_frame) ON CONFLICT(user_id) DO UPDATE SET frame=excluded.frame,frame_key=excluded.frame_key; END IF;
 INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'avatar_frame',auth.uid(),coalesce(p_frame,'none')); RETURN true; END $$;
CREATE OR REPLACE FUNCTION public.set_avatar_frame_fit(p_frame text,p_fit numeric,p_offset_x numeric,p_offset_y numeric) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.can_edit_frame_fits() THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF NOT public.valid_avatar_frame(p_frame) THEN RAISE EXCEPTION 'invalid_frame'; END IF;
 INSERT INTO public.avatar_frame_fits(frame,fit,offset_x,offset_y,updated_by,updated_at) VALUES(p_frame,p_fit,p_offset_x,p_offset_y,auth.uid(),now()) ON CONFLICT(frame) DO UPDATE SET fit=excluded.fit,offset_x=excluded.offset_x,offset_y=excluded.offset_y,updated_by=excluded.updated_by,updated_at=now();
 INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'avatar_frame_fit',auth.uid(),format('%s fit=%s x=%s y=%s',p_frame,p_fit,p_offset_x,p_offset_y)); RETURN true; END $$;
CREATE FUNCTION public.admin_grant_inventory(p_user uuid,p_kind text,p_amount integer,p_frame text,p_reason text,p_request uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_request IS NULL OR p_amount IS NULL OR p_amount<1 OR p_amount>100000 OR length(trim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 PERFORM public.lock_competitive_player(p_user);
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND NOT is_ghost) THEN RAISE EXCEPTION 'invalid_player'; END IF;
 IF EXISTS(SELECT 1 FROM public.mod_actions WHERE actor_id=auth.uid() AND action='grant_inventory' AND reason LIKE p_request::text || ' %') THEN RETURN false; END IF;
 CASE p_kind
 WHEN 'frame' THEN IF p_frame IS NULL OR NOT public.valid_avatar_frame(p_frame) THEN RAISE EXCEPTION 'invalid_frame'; END IF; INSERT INTO public.avatar_frame_access(user_id,frame) VALUES(p_user,p_frame) ON CONFLICT DO NOTHING;
 WHEN 'coins' THEN INSERT INTO public.coin_wallets(user_id,balance) VALUES(p_user,p_amount) ON CONFLICT(user_id) DO UPDATE SET balance=coin_wallets.balance+excluded.balance,updated_at=now();
 WHEN 'protection' THEN PERFORM public.refresh_point_wallet(p_user); UPDATE public.point_protection_wallets SET rank_stock=rank_stock+p_amount WHERE user_id=p_user; INSERT INTO public.point_protection_events(user_id,event,event_key,category,points,stock_change) VALUES(p_user,'admin_grant','admin:'||p_request::text,'rank',0,p_amount);
 ELSE RAISE EXCEPTION 'invalid_kind'; END CASE;
 INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'grant_inventory',p_user,p_request::text||' '||p_kind||' '||p_amount::text||' '||coalesce(p_frame,'')||' '||trim(p_reason)); RETURN true; END $$;
REVOKE ALL ON FUNCTION public.admin_grant_inventory(uuid,text,integer,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_inventory(uuid,text,integer,text,text,uuid) TO authenticated;