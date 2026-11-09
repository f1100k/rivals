CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1500),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcements_created_idx ON public.announcements(created_at DESC);
GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read announcements" ON public.announcements FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.post_announcement(p_message text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_msg text := btrim(coalesce(p_message,''));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF char_length(v_msg) = 0 OR char_length(v_msg) > 1500 THEN RAISE EXCEPTION 'mensagem_invalida'; END IF;
  INSERT INTO public.announcements(message, created_by) VALUES (v_msg, auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.mod_actions(actor_id, action, target_user, reason) VALUES (auth.uid(), 'aviso_geral', NULL, left(v_msg, 200));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.post_announcement(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.post_announcement(text) TO authenticated;