ALTER TABLE public.player_profile_tags ADD COLUMN equipped boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX player_one_equipped_tag ON public.player_profile_tags(user_id) WHERE equipped;
CREATE FUNCTION public.equip_profile_tag(p_tag uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.'; END IF;
PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
IF p_tag IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.player_profile_tags WHERE user_id=auth.uid() AND tag_id=p_tag) THEN RAISE EXCEPTION 'Você não possui esse título.'; END IF;
UPDATE public.player_profile_tags SET equipped=false WHERE user_id=auth.uid() AND equipped;
IF p_tag IS NOT NULL THEN UPDATE public.player_profile_tags SET equipped=true WHERE user_id=auth.uid() AND tag_id=p_tag; END IF;
RETURN true; END $$;
REVOKE ALL ON FUNCTION public.equip_profile_tag(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.equip_profile_tag(uuid) TO authenticated,service_role;