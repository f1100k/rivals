CREATE TABLE public.loss_shield_owners (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  armed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.loss_shield_owners TO authenticated;
GRANT ALL ON public.loss_shield_owners TO service_role;
ALTER TABLE public.loss_shield_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own shield" ON public.loss_shield_owners FOR SELECT TO authenticated USING (auth.uid() = user_id);
INSERT INTO public.loss_shield_owners(user_id) VALUES ('75ecb680-4220-4411-b0b6-ea981f102c2f') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_loss_shield(p_armed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_armed IS NULL THEN RAISE EXCEPTION 'valor_invalido'; END IF;
  UPDATE public.loss_shield_owners SET armed = p_armed, updated_at = now() WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  INSERT INTO public.mod_actions(actor_id, action, target_user, reason)
    VALUES(auth.uid(), CASE WHEN p_armed THEN 'protecao_pessoal_ligada' ELSE 'protecao_pessoal_desligada' END, auth.uid(),
      CASE WHEN p_armed THEN 'próxima derrota não tira MMR' ELSE 'proteção desligada' END);
  RETURN p_armed;
END $$;
REVOKE ALL ON FUNCTION public.set_loss_shield(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_loss_shield(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_match_gk(p_match uuid, p_a integer, p_b integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a numeric; b numeric; winner text; e_a numeric; r record; w point_protection_wallets;
        tier integer; t integer; bot_match boolean;
        v_enabled boolean; v_max_bonus integer; v_max_streak integer;
        v_elo numeric; v_streak integer; v_bonus integer; v_total integer; v_cap integer;
        v_before integer; v_after integer; v_shield boolean;
BEGIN
  PERFORM 1 FROM public.matches WHERE id = p_match AND status IN ('room','voting','reporting','disputed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'partida_ja_finalizada'; END IF;
  IF p_a IS NULL OR p_b IS NULL OR p_a = p_b THEN RAISE EXCEPTION 'empate_nao_permitido'; END IF;
  IF (SELECT count(*) FROM public.match_players WHERE match_id = p_match AND team = 'a') <> 5
     OR (SELECT count(*) FROM public.match_players WHERE match_id = p_match AND team = 'b') <> 5 THEN
    RAISE EXCEPTION 'A partida precisa de dois times de cinco.';
  END IF;
  PERFORM pg_advisory_xact_lock(52719, 5);
  SELECT avg(rating_before) FILTER(WHERE team = 'a'), avg(rating_before) FILTER(WHERE team = 'b') INTO a, b
    FROM public.match_players WHERE match_id = p_match;
  SELECT EXISTS(SELECT 1 FROM public.match_players mp JOIN public.profiles pr ON pr.id = mp.user_id
    WHERE mp.match_id = p_match AND pr.is_ghost) INTO bot_match;
  winner := CASE WHEN p_a > p_b THEN 'a' ELSE 'b' END;
  e_a := 1 / (1 + POWER(10, (b - a) / 400.0));
  SELECT enabled, max_bonus, max_rewarded_streak INTO v_enabled, v_max_bonus, v_max_streak
    FROM public.win_streak_settings WHERE id;
  IF v_enabled IS NULL THEN v_enabled := true; v_max_bonus := 1280; v_max_streak := 10; END IF;
  FOR r IN SELECT mp.team, mp.user_id, pr.rating, pr.win_streak, pr.best_win_streak
    FROM public.match_players mp JOIN public.profiles pr ON pr.id = mp.user_id
    WHERE mp.match_id = p_match ORDER BY mp.user_id LOOP
    PERFORM refresh_point_wallet(r.user_id);
    IF bot_match THEN
      UPDATE public.match_players SET delta = 0, base_delta = 0, rating_after = r.rating, competitive = false
        WHERE match_id = p_match AND user_id = r.user_id;
    ELSE
      v_elo := 32 * (CASE WHEN r.team = winner THEN 1 ELSE 0 END - CASE WHEN r.team = 'a' THEN e_a ELSE 1 - e_a END);
      IF r.team = winner THEN
        v_streak := r.win_streak + 1;
        v_bonus := 0;
        IF v_enabled AND v_streak >= 2 THEN
          t := LEAST(v_streak, GREATEST(2, v_max_streak));
          v_bonus := LEAST((5 * POWER(2, t - 2))::integer, GREATEST(0, v_max_bonus));
        END IF;
      ELSE
        v_streak := 0; v_bonus := 0;
      END IF;
      v_total := ROUND(v_elo) + v_bonus;
      IF r.team <> winner AND v_total < 0 THEN
        UPDATE public.loss_shield_owners SET armed = false, updated_at = now()
          WHERE user_id = r.user_id AND armed RETURNING true INTO v_shield;
        IF v_shield THEN
          INSERT INTO public.mod_actions(actor_id, action, target_user, target_match, reason)
            VALUES(r.user_id, 'protecao_pessoal_usada', r.user_id, p_match, format('perda de %s MMR anulada', -v_total));
          v_total := 0; v_elo := 0;
        END IF;
        v_shield := NULL;
      END IF;
      UPDATE public.match_players SET competitive = true, base_delta = v_total, delta = v_total, rating_after = r.rating + v_total
        WHERE match_id = p_match AND user_id = r.user_id;
      UPDATE public.profiles SET rating = rating + v_total,
        wins = wins + CASE WHEN r.team = winner THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN r.team = winner THEN 0 ELSE 1 END,
        win_streak = v_streak, best_win_streak = GREATEST(best_win_streak, v_streak)
        WHERE id = r.user_id;
      INSERT INTO public.rating_history(user_id, match_id, rating_before, elo_delta, streak_bonus, total_delta, rating_after, win_streak)
        VALUES(r.user_id, p_match, r.rating, v_elo, v_bonus, v_total, r.rating + v_total, v_streak);
      v_before := public.rank_step_of(r.rating); v_after := public.rank_step_of(r.rating + v_total);
      IF v_after > v_before THEN
        FOR t IN (v_before + 1)..v_after LOOP
          INSERT INTO public.rank_history(user_id, match_id, from_rank, to_rank, kind, rating)
            VALUES(r.user_id, p_match, public.rank_label((t - 1) * 100), public.rank_label(t * 100), 'promotion', r.rating + v_total);
        END LOOP;
      ELSIF v_after < v_before THEN
        FOR t IN REVERSE v_before..(v_after + 1) LOOP
          INSERT INTO public.rank_history(user_id, match_id, from_rank, to_rank, kind, rating)
            VALUES(r.user_id, p_match, public.rank_label(t * 100), public.rank_label((t - 1) * 100), 'relegation', r.rating + v_total);
        END LOOP;
      END IF;
      SELECT * INTO w FROM public.point_protection_wallets WHERE user_id = r.user_id FOR UPDATE;
      tier := least(5, greatest(0, r.rating + v_total) / 300);
      IF tier > w.highest_tier THEN
        FOR t IN (w.highest_tier + 1)..tier LOOP
          INSERT INTO public.point_protection_events(user_id, match_id, event, event_key, category, stock_change)
            VALUES(r.user_id, p_match, 'rank_grant', t::text, 'rank', 1) ON CONFLICT DO NOTHING;
          IF FOUND THEN UPDATE public.point_protection_wallets SET rank_stock = rank_stock + 1 WHERE user_id = r.user_id; END IF;
        END LOOP;
        UPDATE public.point_protection_wallets SET highest_tier = tier WHERE user_id = r.user_id;
      END IF;
      INSERT INTO public.point_protection_events(user_id, match_id, event, event_key, points)
        VALUES(r.user_id, p_match, 'match_result', p_match::text, v_total);
    END IF;
  END LOOP;
  UPDATE public.matches SET average_a = a, average_b = b, score_a = p_a, score_b = p_b, status = 'completed', completed_at = now()
    WHERE id = p_match;
END $$;