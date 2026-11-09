ALTER TABLE public.custom_avatar_frames ALTER COLUMN public_access SET DEFAULT false;
CREATE FUNCTION public.admin_publish_shop_frame(p_id text,p_name text,p_path text,p_price integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_price IS NULL OR p_price < 0 OR p_price > 100000 THEN RAISE EXCEPTION 'invalid_price'; END IF;
 IF p_path NOT LIKE auth.uid()::text || '/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='frame-art' AND name=p_path) THEN RAISE EXCEPTION 'invalid_image'; END IF;
 INSERT INTO public.custom_avatar_frames(id,name,image_path,public_access,created_by) VALUES(p_id,trim(p_name),p_path,false,auth.uid());
 INSERT INTO public.shop_items(id,name,kind,price,sort) VALUES(p_id,trim(p_name),'frame',p_price,100);
 INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'publish_frame',p_id||' '||trim(p_name)||' ('||p_price||' moedas)'); RETURN true; END $$;
REVOKE ALL ON FUNCTION public.admin_publish_shop_frame(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_shop_frame(text,text,text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_publish_frame(p_id text,p_name text,p_path text,p_public boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN public.admin_publish_shop_frame(p_id,p_name,p_path,500); END $$;
COMMENT ON FUNCTION public.admin_publish_frame(text,text,text,boolean) IS 'DEPRECATED: compatibility wrapper; publishes to shop only. p_public is ignored.';