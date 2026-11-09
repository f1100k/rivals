ALTER TABLE public.custom_avatar_frames ADD COLUMN active boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.valid_avatar_frame(p_frame text) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$ SELECT p_frame IN ('coroa-fogo','dragao-roxo','coroa-fumaca','gelo-cristal','lua-vermelha','corrente-roxa','leao-dourado','guerreiro-roxo','natureza','demonio-roxo','neon-roxo') OR EXISTS(SELECT 1 FROM public.custom_avatar_frames WHERE id=p_frame AND active); $$;
CREATE FUNCTION public.admin_remove_uploaded_frame(p_frame text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 UPDATE public.custom_avatar_frames SET active=false,public_access=false WHERE id=p_frame AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_frame'; END IF;
 UPDATE public.shop_items SET active=false WHERE id=p_frame;
 DELETE FROM public.avatar_frames WHERE frame_key=p_frame;
 INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'remove_frame',p_frame);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_remove_uploaded_frame(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_uploaded_frame(text) TO authenticated;