CREATE TABLE public.site_countdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_countdowns TO anon, authenticated;
GRANT ALL ON public.site_countdowns TO service_role;
ALTER TABLE public.site_countdowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Countdown público ativo" ON public.site_countdowns FOR SELECT TO anon, authenticated USING (active);
CREATE INDEX site_countdowns_active_idx ON public.site_countdowns (created_at DESC) WHERE active;

CREATE OR REPLACE FUNCTION public.admin_set_countdown(p_label text, p_ends_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_label IS NULL OR char_length(btrim(p_label)) = 0 THEN RAISE EXCEPTION 'texto_obrigatorio'; END IF;
  IF p_ends_at <= now() THEN RAISE EXCEPTION 'data_no_passado'; END IF;
  UPDATE public.site_countdowns SET active = false WHERE active;
  INSERT INTO public.site_countdowns(label, ends_at, created_by) VALUES (left(btrim(p_label),120), p_ends_at, auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'countdown_set', left(btrim(p_label),120));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_clear_countdown()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  UPDATE public.site_countdowns SET active = false WHERE active;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'countdown_clear', NULL);
END $$;

REVOKE ALL ON FUNCTION public.admin_set_countdown(text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_clear_countdown() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_countdown(text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_countdown() TO authenticated;