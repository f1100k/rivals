CREATE OR REPLACE FUNCTION public.can_edit_frame_fits()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IN ('75ecb680-4220-4411-b0b6-ea981f102c2f'::uuid, 'd4ccb4bb-978c-4205-9a36-8a5880bf069f'::uuid)
$$;
GRANT EXECUTE ON FUNCTION public.can_edit_frame_fits() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_avatar_frame_fit(p_frame text, p_fit numeric, p_offset_x numeric, p_offset_y numeric)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_edit_frame_fits() THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_frame IS NULL OR length(p_frame) > 40 THEN RAISE EXCEPTION 'invalid_frame'; END IF;
  INSERT INTO public.avatar_frame_fits(frame, fit, offset_x, offset_y, updated_by, updated_at)
  VALUES (p_frame, p_fit, p_offset_x, p_offset_y, auth.uid(), now())
  ON CONFLICT (frame) DO UPDATE SET fit = EXCLUDED.fit, offset_x = EXCLUDED.offset_x, offset_y = EXCLUDED.offset_y, updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO public.mod_actions(actor_id, action, target_user, reason)
  VALUES (auth.uid(), 'avatar_frame_fit', auth.uid(), format('%s fit=%s x=%s y=%s', p_frame, p_fit, p_offset_x, p_offset_y));
  RETURN true;
END $function$;