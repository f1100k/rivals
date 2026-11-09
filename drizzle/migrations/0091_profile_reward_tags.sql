CREATE TABLE public.profile_tags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 40), text_color text NOT NULL CHECK(text_color ~ '^#[0-9A-Fa-f]{6}$'), background_color text NOT NULL CHECK(background_color ~ '^#[0-9A-Fa-f]{6}$'), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.profile_tags TO authenticated; GRANT ALL ON public.profile_tags TO service_role;
ALTER TABLE public.profile_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tags_read ON public.profile_tags FOR SELECT TO authenticated USING(true);
CREATE TABLE public.player_profile_tags (user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, tag_id uuid NOT NULL REFERENCES public.profile_tags(id) ON DELETE CASCADE, granted_by uuid NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,tag_id));
GRANT SELECT ON public.player_profile_tags TO authenticated; GRANT ALL ON public.player_profile_tags TO service_role;
ALTER TABLE public.player_profile_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_tags_read ON public.player_profile_tags FOR SELECT TO authenticated USING(true);
CREATE FUNCTION public.admin_save_profile_tag(p_id uuid,p_name text,p_text text,p_background text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente admins.'; END IF;
INSERT INTO public.profile_tags(id,name,text_color,background_color,created_by) VALUES(coalesce(p_id,gen_random_uuid()),trim(p_name),p_text,p_background,auth.uid()) ON CONFLICT(id) DO UPDATE SET name=excluded.name,text_color=excluded.text_color,background_color=excluded.background_color RETURNING id INTO v;
INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'profile_tag_saved',v::text||': '||trim(p_name)); RETURN v; END $$;
CREATE FUNCTION public.admin_grant_profile_tag(p_tag uuid,p_users uuid[],p_remove boolean DEFAULT false) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n integer; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente admins.'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.profile_tags WHERE id=p_tag) THEN RAISE EXCEPTION 'Tag inexistente.'; END IF;
IF p_remove THEN DELETE FROM public.player_profile_tags WHERE tag_id=p_tag AND user_id=ANY(p_users); ELSE
INSERT INTO public.player_profile_tags(user_id,tag_id,granted_by) SELECT id,p_tag,auth.uid() FROM public.profiles WHERE id=ANY(p_users) AND NOT is_ghost ON CONFLICT DO NOTHING; END IF;
GET DIAGNOSTICS n=ROW_COUNT;
INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),CASE WHEN p_remove THEN 'profile_tag_revoked' ELSE 'profile_tag_granted' END,p_tag::text||': '||array_to_string(p_users,',')); RETURN n; END $$;
REVOKE ALL ON FUNCTION public.admin_save_profile_tag(uuid,text,text,text),public.admin_grant_profile_tag(uuid,uuid[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_profile_tag(uuid,text,text,text),public.admin_grant_profile_tag(uuid,uuid[],boolean) TO authenticated,service_role;