CREATE OR REPLACE FUNCTION public.finalize_match_gk(p_match uuid, p_a integer, p_b integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a numeric; b numeric; winner text; e_a numeric; r record; w point_protection_wallets;
        tier integer; t integer; bot_match boolean;
        v_enabled boolean; v_max_bonus integer; v_max_streak integer;
        v_elo numeric; v_streak integer; v_bonus integer; v_total integer; v_cap integer;
        v_before integer; v_after integer; v_shield boolean; v_new integer; v_owner public.loss_shield_owners%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.matches WHERE id = p_match AND status IN ('room','voting','reporting','disputed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'partida_ja_finalizada'; END IF; IF public.kick_match_paused(p_match) THEN RAISE EXCEPTION 'Aguarde a votação de expulsão ou o substituto.'; END IF;
  IF p_a IS NULL OR p_b IS NULL OR p_a = p_b THEN RAISE EXCEPTION 'empate_nao_permitido'; END IF;
  IF (SELECT count(*) FROM public.match_players WHERE match_id = p_match AND team = 'a') <> 5
     OR (SELECT count(*) FROM public.match_players WHERE match_id = p_match AND team = 'b') <> 5 THEN
    RAISE EXCEPTION 'A partida precisa de dois times de cinco.';
  END IF;
  PERFORM public.lock_competitive_player(s.user_id) FROM (SELECT user_id FROM public.match_players WHERE match_id = p_match ORDER BY user_id) s;
  SELECT avg(rating_before) FILTER(WHERE team = 'a'), avg(rating_before) FILTER(WHERE team = 'b') INTO a, b
    FROM public.match_players WHERE match_id = p_match;
  SELECT EXISTS(SELECT 1 FROM public.match_players mp JOIN public.profiles pr ON pr.id = mp.user_id
    WHERE mp.match_id = p_match AND pr.is_ghost) OR EXISTS(SELECT 1 FROM public.matches WHERE id = p_match AND (region = 'TESTE' OR had_bots)) INTO bot_match;
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
          v_bonus := LEAST(5 * (t - 1), GREATEST(0, v_max_bonus));
        END IF;
      ELSE
        v_streak := 0; v_bonus := 0;
      END IF;
      v_total := ROUND(v_elo) + v_bonus;
      SELECT * INTO v_owner FROM public.loss_shield_owners WHERE user_id = r.user_id AND paired_losses FOR UPDATE;
      IF FOUND THEN
        IF r.team = winner THEN
          UPDATE public.loss_shield_owners SET pending_loss = false, armed = false, updated_at = now() WHERE user_id = r.user_id;
          IF v_owner.pending_loss THEN
            INSERT INTO public.mod_actions(actor_id, action, target_user, target_match, reason)
              VALUES(r.user_id, 'protecao_pessoal_sequencia_reiniciada', r.user_id, p_match, 'Vitória interrompeu a sequência de derrotas.');
          END IF;
        ELSE
          v_total := CASE WHEN v_owner.pending_loss THEN -17 ELSE 0 END;
          v_elo := v_total;
          UPDATE public.loss_shield_owners SET pending_loss = NOT v_owner.pending_loss, armed = false, updated_at = now() WHERE user_id = r.user_id;
          INSERT INTO public.mod_actions(actor_id, action, target_user, target_match, reason)
            VALUES(r.user_id, CASE WHEN v_owner.pending_loss THEN 'protecao_pessoal_par_descontado' ELSE 'protecao_pessoal_usada' END, r.user_id, p_match,
              CASE WHEN v_owner.pending_loss THEN 'Segunda derrota seguida: desconto de até 17 MMR, respeitando o piso zero; novo par iniciado.' ELSE 'Primeira derrota do par: derrota registrada sem desconto de MMR.' END);
        END IF;
      END IF;
      v_new := GREATEST(0, r.rating + v_total);
      UPDATE public.match_players SET competitive = true, base_delta = v_total, delta = v_total, rating_after = v_new
        WHERE match_id = p_match AND user_id = r.user_id;
      UPDATE public.profiles SET rating = v_new,
        wins = wins + CASE WHEN r.team = winner THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN r.team = winner THEN 0 ELSE 1 END,
        win_streak = v_streak, best_win_streak = GREATEST(best_win_streak, v_streak)
        WHERE id = r.user_id;
      INSERT INTO public.rating_history(user_id, match_id, rating_before, elo_delta, streak_bonus, total_delta, rating_after, win_streak)
        VALUES(r.user_id, p_match, r.rating, v_elo, v_bonus, v_total, v_new, v_streak);
      v_before := public.rank_step_of(r.rating); v_after := public.rank_step_of(v_new);
      IF v_after > v_before THEN
        FOR t IN (v_before + 1)..v_after LOOP
          INSERT INTO public.rank_history(user_id, match_id, from_rank, to_rank, kind, rating)
            VALUES(r.user_id, p_match, public.rank_label((t - 1) * 100), public.rank_label(t * 100), 'promotion', v_new);
        END LOOP;
      ELSIF v_after < v_before THEN
        FOR t IN REVERSE v_before..(v_after + 1) LOOP
          INSERT INTO public.rank_history(user_id, match_id, from_rank, to_rank, kind, rating)
            VALUES(r.user_id, p_match, public.rank_label(t * 100), public.rank_label((t - 1) * 100), 'relegation', v_new);
        END LOOP;
      END IF;
      SELECT * INTO w FROM public.point_protection_wallets WHERE user_id = r.user_id FOR UPDATE;
      tier := least(5, greatest(0, v_new) / 300);
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
END $function$;