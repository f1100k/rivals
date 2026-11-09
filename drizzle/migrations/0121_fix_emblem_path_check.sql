CREATE OR REPLACE FUNCTION public.admin_save_emblem(p_id uuid, p_name text, p_path text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Somente admins.'; END IF;
  IF p_path IS NULL OR length(p_path) NOT BETWEEN 1 AND 300 OR p_path !~ '^[A-Za-z0-9/_.-]+$' THEN RAISE EXCEPTION 'imagem_invalida'; END IF;
  INSERT INTO public.emblems(id, name, image_path, created_by)
  VALUES (coalesce(p_id, gen_random_uuid()), trim(p_name), p_path, auth.uid())
  ON CONFLICT (id) DO UPDATE SET name = excluded.name, image_path = excluded.image_path
  RETURNING id INTO v;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'emblem_saved', v::text || ': ' || trim(p_name));
  RETURN v;
END $$;