CREATE TABLE public.emblems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  image_path text NOT NULL CHECK (length(image_path) BETWEEN 1 AND 300),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.emblems TO anon, authenticated;
GRANT ALL ON public.emblems TO service_role;
ALTER TABLE public.emblems ENABLE ROW LEVEL SECURITY;
CREATE POLICY emblems_read ON public.emblems FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.player_emblems (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emblem_id uuid NOT NULL REFERENCES public.emblems(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  equipped boolean NOT NULL DEFAULT false,
  season_id uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, emblem_id)
);
CREATE UNIQUE INDEX player_emblems_one_equipped ON public.player_emblems(user_id) WHERE equipped;
CREATE INDEX player_emblems_emblem ON public.player_emblems(emblem_id);
GRANT SELECT ON public.player_emblems TO anon, authenticated;
GRANT ALL ON public.player_emblems TO service_role;
ALTER TABLE public.player_emblems ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_emblems_read ON public.player_emblems FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins enviam emblemas" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'emblems' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins apagam emblemas" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'emblems' AND public.has_role(auth.uid(), 'admin'));

CREATE FUNCTION public.admin_save_emblem(p_id uuid, p_name text, p_path text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Somente admins.'; END IF;
  IF p_path IS NULL OR p_path !~ '^[A-Za-z0-9/_.-]{1,300}$' THEN RAISE EXCEPTION 'imagem_invalida'; END IF;
  INSERT INTO public.emblems(id, name, image_path, created_by)
  VALUES (coalesce(p_id, gen_random_uuid()), trim(p_name), p_path, auth.uid())
  ON CONFLICT (id) DO UPDATE SET name = excluded.name, image_path = excluded.image_path
  RETURNING id INTO v;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'emblem_saved', v::text || ': ' || trim(p_name));
  RETURN v;
END $$;

CREATE FUNCTION public.admin_delete_emblem(p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_path text; v_name text; BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Somente admins.'; END IF;
  DELETE FROM public.emblems WHERE id = p_id RETURNING image_path, name INTO v_path, v_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'emblema_inexistente'; END IF;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'emblem_deleted', p_id::text || ': ' || v_name);
  RETURN v_path;
END $$;

CREATE FUNCTION public.admin_grant_emblem(p_emblem uuid, p_users uuid[], p_remove boolean, p_season uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; v_name text; v_season_name text; BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Somente admins.'; END IF;
  SELECT name INTO v_name FROM public.emblems WHERE id = p_emblem;
  IF NOT FOUND THEN RAISE EXCEPTION 'emblema_inexistente'; END IF;
  IF p_season IS NOT NULL THEN
    SELECT name INTO v_season_name FROM public.seasons WHERE id = p_season;
    IF NOT FOUND THEN RAISE EXCEPTION 'season_inexistente'; END IF;
  END IF;
  IF p_remove THEN
    DELETE FROM public.player_emblems WHERE emblem_id = p_emblem AND user_id = ANY(p_users);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    WITH ins AS (
      INSERT INTO public.player_emblems(user_id, emblem_id, granted_by, season_id)
      SELECT id, p_emblem, auth.uid(), p_season FROM public.profiles WHERE id = ANY(p_users) AND NOT is_ghost
      ON CONFLICT DO NOTHING RETURNING user_id)
    INSERT INTO public.user_notifications(user_id, kind, title, body)
    SELECT user_id, 'tag', 'Você recebeu um emblema', 'Emblema "' || v_name || '"' || coalesce(' (' || v_season_name || ')', '') || ' disponível em Perfil → Meus emblemas.' FROM ins;
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  INSERT INTO public.mod_actions(actor_id, action, reason)
  VALUES (auth.uid(), CASE WHEN p_remove THEN 'emblem_revoked' ELSE 'emblem_granted' END, p_emblem::text || coalesce(' [' || v_season_name || ']', '') || ': ' || array_to_string(p_users, ','));
  RETURN n;
END $$;

CREATE FUNCTION public.equip_emblem(p_emblem uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'nao_autenticado'; END IF;
  IF p_emblem IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.player_emblems WHERE user_id = auth.uid() AND emblem_id = p_emblem) THEN
    RAISE EXCEPTION 'emblema_nao_liberado';
  END IF;
  UPDATE public.player_emblems SET equipped = false WHERE user_id = auth.uid() AND equipped;
  IF p_emblem IS NOT NULL THEN
    UPDATE public.player_emblems SET equipped = true WHERE user_id = auth.uid() AND emblem_id = p_emblem;
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.get_equipped_emblems() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', e.name, 'image_path', e.image_path, 'season_number', s.number)), '[]'::jsonb)
  FROM public.player_emblems p JOIN public.emblems e ON e.id = p.emblem_id LEFT JOIN public.seasons s ON s.id = p.season_id
  WHERE p.equipped
$$;

REVOKE ALL ON FUNCTION public.admin_save_emblem(uuid, text, text), public.admin_delete_emblem(uuid), public.admin_grant_emblem(uuid, uuid[], boolean, uuid), public.equip_emblem(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_emblem(uuid, text, text), public.admin_delete_emblem(uuid), public.admin_grant_emblem(uuid, uuid[], boolean, uuid), public.equip_emblem(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_equipped_emblems() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_equipped_emblems() TO anon, authenticated, service_role;