-- Admin-readable view of the winning-run bonus controls, and an admin-only setter.
-- The finalizer already reads these values, so changing them changes what the next match pays.
CREATE OR REPLACE FUNCTION public.get_win_streak_settings()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'enabled', enabled,
    'maxBonus', max_bonus,
    'maxRewardedStreak', max_rewarded_streak,
    'updatedAt', updated_at)::json
  FROM public.win_streak_settings WHERE id;
$$;

CREATE OR REPLACE FUNCTION public.set_win_streak_settings(p_enabled boolean, p_max_bonus integer, p_max_streak integer)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'bonus_invalido'; END IF;
  IF p_max_bonus IS NULL OR p_max_bonus < 0 OR p_max_bonus > 100000 THEN RAISE EXCEPTION 'bonus_invalido'; END IF;
  IF p_max_streak IS NULL OR p_max_streak < 1 OR p_max_streak > 100 THEN RAISE EXCEPTION 'sequencia_invalida'; END IF;
  UPDATE public.win_streak_settings
    SET enabled = p_enabled, max_bonus = p_max_bonus, max_rewarded_streak = p_max_streak, updated_at = now()
    WHERE id;
  INSERT INTO mod_actions (actor_id, action, reason)
    VALUES (auth.uid(), 'ajustar_bonus_vitorias',
      format('sequência até %s vitórias · bônus máximo %s · %s', p_max_streak, p_max_bonus, CASE WHEN p_enabled THEN 'ligado' ELSE 'desligado' END));
  SELECT json_build_object('enabled', enabled, 'maxBonus', max_bonus, 'maxRewardedStreak', max_rewarded_streak)::json INTO v
    FROM public.win_streak_settings WHERE id;
  RETURN v;
END $$;