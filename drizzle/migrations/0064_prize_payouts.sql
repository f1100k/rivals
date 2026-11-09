CREATE TABLE public.prize_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  place integer NOT NULL CHECK (place BETWEEN 1 AND 3),
  amount numeric NOT NULL CHECK (amount >= 0),
  rating integer NOT NULL,
  note text,
  paid_by uuid NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.prize_payouts TO authenticated;
GRANT ALL ON public.prize_payouts TO service_role;
ALTER TABLE public.prize_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read prize payouts" ON public.prize_payouts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.mark_prize_paid(p_user uuid, p_place integer, p_amount numeric, p_note text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_rating integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_place NOT BETWEEN 1 AND 3 OR p_amount < 0 THEN RAISE EXCEPTION 'invalid'; END IF;
  SELECT rating INTO v_rating FROM public.profiles WHERE id = p_user AND NOT is_ghost;
  IF v_rating IS NULL THEN RAISE EXCEPTION 'player_not_found'; END IF;
  INSERT INTO public.prize_payouts(user_id, place, amount, rating, note, paid_by)
    VALUES (p_user, p_place, p_amount, v_rating, nullif(trim(p_note), ''), auth.uid());
  INSERT INTO public.mod_actions(actor_id, action, target_user, reason)
    VALUES (auth.uid(), 'premio_pago', p_user, p_place || 'º lugar · R$ ' || p_amount || coalesce(' · ' || nullif(trim(p_note), ''), ''));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.mark_prize_paid(uuid, integer, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_prize_paid(uuid, integer, numeric, text) TO authenticated;