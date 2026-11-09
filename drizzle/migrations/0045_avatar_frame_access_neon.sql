CREATE TABLE public.avatar_frame_access (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  frame text NOT NULL,
  PRIMARY KEY (user_id, frame)
);
GRANT SELECT ON public.avatar_frame_access TO authenticated;
GRANT ALL ON public.avatar_frame_access TO service_role;
ALTER TABLE public.avatar_frame_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own frame access" ON public.avatar_frame_access FOR SELECT TO authenticated USING (user_id = auth.uid());
ALTER TABLE public.avatar_frames DROP CONSTRAINT avatar_frames_frame_check;
ALTER TABLE public.avatar_frames ADD CONSTRAINT avatar_frames_frame_check CHECK (frame IN ('coroa-fogo','dragao-roxo','coroa-fumaca','gelo-cristal','lua-vermelha','corrente-roxa','leao-dourado','guerreiro-roxo','natureza','demonio-roxo','neon-roxo'));
CREATE OR REPLACE FUNCTION public.set_admin_avatar_frame(p_frame text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT EXISTS (
    SELECT 1 FROM public.avatar_frame_access WHERE user_id = auth.uid() AND (p_frame IS NULL OR frame = p_frame)
  ) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_frame IS NULL THEN
    DELETE FROM public.avatar_frames WHERE user_id = auth.uid();
  ELSE
    IF p_frame NOT IN ('coroa-fogo','dragao-roxo','coroa-fumaca','gelo-cristal','lua-vermelha','corrente-roxa','leao-dourado','guerreiro-roxo','natureza','demonio-roxo','neon-roxo') THEN RAISE EXCEPTION 'invalid_frame'; END IF;
    INSERT INTO public.avatar_frames(user_id,frame) VALUES (auth.uid(),p_frame) ON CONFLICT (user_id) DO UPDATE SET frame=excluded.frame;
  END IF;
  INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'avatar_frame',auth.uid(),coalesce(p_frame,'none'));
  RETURN true;
END;
$function$;