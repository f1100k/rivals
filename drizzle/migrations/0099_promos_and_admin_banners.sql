CREATE TABLE public.promo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('text','image','video')),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 80),
  body text CHECK (body IS NULL OR char_length(body) <= 400),
  media_path text,
  link_url text CHECK (link_url IS NULL OR link_url ~ '^https?://'),
  video_repeats integer NOT NULL DEFAULT 1 CHECK (video_repeats BETWEEN 1 AND 20),
  in_rotation boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'text' AND (char_length(title) > 0 OR body IS NOT NULL)) OR (kind <> 'text' AND media_path IS NOT NULL))
);
GRANT SELECT ON public.promo_items TO anon, authenticated;
GRANT ALL ON public.promo_items TO service_role;
ALTER TABLE public.promo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Promos em rotação são públicas" ON public.promo_items FOR SELECT TO anon, authenticated USING (in_rotation);
CREATE POLICY "Admins veem todas as promos" ON public.promo_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX promo_items_rotation_idx ON public.promo_items (sort) WHERE in_rotation;

CREATE TABLE public.promo_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  interval_seconds integer NOT NULL DEFAULT 15 CHECK (interval_seconds BETWEEN 3 AND 600),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.promo_settings TO anon, authenticated;
GRANT ALL ON public.promo_settings TO service_role;
ALTER TABLE public.promo_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Config de promos pública" ON public.promo_settings FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.promo_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_save_promo(p_id uuid, p_kind text, p_title text, p_body text, p_media_path text, p_link text, p_repeats integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_media_path IS NOT NULL AND p_media_path !~ '^[0-9a-f-]+/[A-Za-z0-9._-]+$' THEN RAISE EXCEPTION 'arquivo_invalido'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.promo_items(kind, title, body, media_path, link_url, video_repeats, created_by)
    VALUES (p_kind, coalesce(btrim(p_title),''), nullif(btrim(p_body),''), p_media_path, nullif(btrim(p_link),''), coalesce(p_repeats,1), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'promo_create', left(p_kind || ': ' || coalesce(p_title,''), 200));
  ELSE
    UPDATE public.promo_items SET title = coalesce(btrim(p_title),''), body = nullif(btrim(p_body),''),
      link_url = nullif(btrim(p_link),''), video_repeats = coalesce(p_repeats, video_repeats)
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'promo_nao_encontrada'; END IF;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_promo(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_path text; v_title text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  DELETE FROM public.promo_items WHERE id = p_id RETURNING media_path, title INTO v_path, v_title;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'promo_delete', left(coalesce(v_title,''), 200));
  RETURN v_path;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_promo_rotation(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  UPDATE public.promo_items SET in_rotation = false WHERE in_rotation AND NOT (id = ANY(coalesce(p_ids, '{}')));
  UPDATE public.promo_items p SET in_rotation = true, sort = x.ord
  FROM unnest(coalesce(p_ids, '{}')) WITH ORDINALITY AS x(id, ord) WHERE p.id = x.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_promo_settings(p_interval integer, p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  INSERT INTO public.promo_settings(id, interval_seconds, enabled, updated_at) VALUES (true, p_interval, p_enabled, now())
  ON CONFLICT (id) DO UPDATE SET interval_seconds = EXCLUDED.interval_seconds, enabled = EXCLUDED.enabled, updated_at = now();
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.admin_save_promo(uuid, text, text, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_promo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_promo_rotation(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_promo_settings(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_promo(uuid, text, text, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_promo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_promo_rotation(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_promo_settings(integer, boolean) TO authenticated;

CREATE POLICY "Admins enviam promos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'promos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins apagam promos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'promos' AND public.has_role(auth.uid(), 'admin'));

-- Banner: only admins may set one; anyone may clear (removal is harmless).
CREATE OR REPLACE FUNCTION public.guard_profile_banner_staff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.banner_url IS DISTINCT FROM OLD.banner_url AND NEW.banner_url IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'banner restrito a administradores';
  END IF;
  RETURN NEW;
END $$;
COMMENT ON COLUMN public.profiles.banner_url IS 'Public profile banner storage path; only admins may set one (guard_profile_banner_staff).';