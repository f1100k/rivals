CREATE TABLE public.avatar_frames (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 frame text NOT NULL CHECK (frame IN ('lightning','fire','flowers','ice','royal','galaxy','nature','ocean','rose','dragon'))
);
GRANT SELECT ON public.avatar_frames TO anon, authenticated;
GRANT ALL ON public.avatar_frames TO service_role;
ALTER TABLE public.avatar_frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active admin frames readable" ON public.avatar_frames FOR SELECT TO anon, authenticated USING (public.has_role(user_id, 'admin'));
CREATE OR REPLACE FUNCTION public.set_admin_avatar_frame(p_frame text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_frame IS NULL THEN DELETE FROM public.avatar_frames WHERE user_id = auth.uid();
 ELSE
 IF p_frame NOT IN ('lightning','fire','flowers','ice','royal','galaxy','nature','ocean','rose','dragon') THEN RAISE EXCEPTION 'invalid_frame'; END IF;
 INSERT INTO public.avatar_frames(user_id,frame) VALUES (auth.uid(),p_frame) ON CONFLICT (user_id) DO UPDATE SET frame=excluded.frame;
 END IF;
 INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'avatar_frame',auth.uid(),coalesce(p_frame,'none'));
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.set_admin_avatar_frame(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_admin_avatar_frame(text) TO authenticated;