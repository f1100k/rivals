CREATE TABLE public.avatar_frame_fits (
  frame text PRIMARY KEY,
  fit numeric NOT NULL CHECK (fit BETWEEN 100 AND 450),
  offset_x numeric NOT NULL DEFAULT 0 CHECK (offset_x BETWEEN -50 AND 50),
  offset_y numeric NOT NULL DEFAULT 0 CHECK (offset_y BETWEEN -50 AND 50),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.avatar_frame_fits TO anon, authenticated;
GRANT ALL ON public.avatar_frame_fits TO service_role;
ALTER TABLE public.avatar_frame_fits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read frame fits" ON public.avatar_frame_fits FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_avatar_frame_fit(p_frame text, p_fit numeric, p_offset_x numeric, p_offset_y numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_frame IS NULL OR length(p_frame) > 40 THEN RAISE EXCEPTION 'invalid_frame'; END IF;
  INSERT INTO public.avatar_frame_fits(frame, fit, offset_x, offset_y, updated_by, updated_at)
  VALUES (p_frame, p_fit, p_offset_x, p_offset_y, auth.uid(), now())
  ON CONFLICT (frame) DO UPDATE SET fit = EXCLUDED.fit, offset_x = EXCLUDED.offset_x, offset_y = EXCLUDED.offset_y, updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO public.mod_actions(actor_id, action, details)
  VALUES (auth.uid(), 'avatar_frame_fit', jsonb_build_object('frame', p_frame, 'fit', p_fit, 'x', p_offset_x, 'y', p_offset_y));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.set_avatar_frame_fit(text, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_avatar_frame_fit(text, numeric, numeric, numeric) TO authenticated;