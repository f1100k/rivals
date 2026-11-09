CREATE OR REPLACE FUNCTION public.set_avatar_frame_fit(p_frame text, p_fit numeric, p_offset_x numeric, p_offset_y numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_frame IS NULL OR length(p_frame) > 40 THEN RAISE EXCEPTION 'invalid_frame'; END IF;
  INSERT INTO public.avatar_frame_fits(frame, fit, offset_x, offset_y, updated_by, updated_at)
  VALUES (p_frame, p_fit, p_offset_x, p_offset_y, auth.uid(), now())
  ON CONFLICT (frame) DO UPDATE SET fit = EXCLUDED.fit, offset_x = EXCLUDED.offset_x, offset_y = EXCLUDED.offset_y, updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO public.mod_actions(actor_id, action, target_user, reason)
  VALUES (auth.uid(), 'avatar_frame_fit', auth.uid(), format('%s fit=%s x=%s y=%s', p_frame, p_fit, p_offset_x, p_offset_y));
  RETURN true;
END $$;