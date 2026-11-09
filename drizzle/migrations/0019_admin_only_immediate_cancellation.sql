CREATE OR REPLACE FUNCTION public.admin_cancel_match(p_match uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT status INTO v_status FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'partida_nao_encontrada'; END IF;
  IF v_status IN ('completed', 'cancelled') THEN RETURN false; END IF;
  UPDATE public.matches SET status = 'cancelled', completed_at = now() WHERE id = p_match;
  INSERT INTO public.mod_actions (actor_id, action, target_match, reason)
    VALUES (auth.uid(), 'cancelar_partida', p_match, p_reason);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_cancel_match(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_match(uuid, text) TO authenticated;