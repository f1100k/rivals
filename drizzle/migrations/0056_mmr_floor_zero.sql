-- MMR nunca fica abaixo de zero: piso no finalize_match_gk, na penalidade por trolling e trava na tabela.

-- 1) Corrige quem já está negativo
UPDATE public.profiles SET rating = 0 WHERE rating < 0;

-- 2) Trava definitiva na tabela
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_rating_nonnegative;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_rating_nonnegative CHECK (rating >= 0);

-- 3) Finalização de partida com piso de zero
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
        v_before integer; v_after integer; v_shield boolean; v_new integer;
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

-- 4) Penalidade por trolling também respeita o piso
CREATE OR REPLACE FUNCTION public.review_player_report(p_target uuid, p_report uuid, p_action text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s player_report_state; n integer; match_id_to_penalize uuid; r match_players; confirmed_now boolean;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF length(trim(p_reason))<3 OR length(trim(p_reason))>1000 THEN RAISE EXCEPTION 'Informe o motivo do veredito.'; END IF;
  PERFORM pg_advisory_xact_lock(52719,5);
  SELECT * INTO s FROM player_report_state WHERE target_id=p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogador sem denúncias.'; END IF;
  IF p_action='lift' THEN
    UPDATE player_report_state SET strikes=greatest(0,strikes-CASE WHEN banned_until>now() THEN 1 ELSE 0 END),banned_until=NULL,cycle=cycle+1,eligible_since=now() WHERE target_id=p_target;
  ELSIF p_action IN ('dismiss','uphold') THEN
    UPDATE player_reports SET dismissed=(p_action='dismiss'),confirmed=(p_action='uphold'),verdict=trim(p_reason) WHERE id=p_report AND target_id=p_target AND cycle=s.cycle RETURNING match_id INTO match_id_to_penalize;
    IF NOT FOUND THEN RAISE EXCEPTION 'Denúncia não encontrada no ciclo atual.'; END IF;
    SELECT count(DISTINCT reporter_id) INTO n FROM player_reports WHERE target_id=p_target AND match_id=match_id_to_penalize AND cycle=s.cycle AND confirmed AND NOT dismissed;
    IF n>=7 THEN
      SELECT * INTO r FROM match_players WHERE match_id=match_id_to_penalize AND user_id=p_target FOR UPDATE;
      IF r.competitive AND r.trolling_delta=0 THEN
        PERFORM refresh_point_wallet(p_target);
        IF r.protection_kind IS NOT NULL THEN
          UPDATE profiles SET rating=GREATEST(0, rating+r.base_delta) WHERE id=p_target;
          UPDATE match_players SET delta=delta+r.base_delta,rating_after=GREATEST(0, rating_after+r.base_delta),protection_kind=NULL WHERE match_id=match_id_to_penalize AND user_id=p_target;
          IF r.protection_kind='daily' THEN UPDATE point_protection_wallets SET daily_available=true WHERE user_id=p_target;
          ELSE UPDATE point_protection_wallets SET rank_stock=rank_stock+1 WHERE user_id=p_target; END IF;
          INSERT INTO point_protection_events(user_id,match_id,event,event_key,category,points,stock_change) VALUES(p_target,match_id_to_penalize,'protection_revoked',match_id_to_penalize::text,r.protection_kind,r.base_delta,1);
        END IF;
        UPDATE profiles SET rating=GREATEST(0, rating-9) WHERE id=p_target;
        UPDATE match_players SET delta=delta-9,rating_after=GREATEST(0, rating_after-9),trolling_delta=-9 WHERE match_id=match_id_to_penalize AND user_id=p_target;
        INSERT INTO point_protection_events(user_id,match_id,event,event_key,points) VALUES(p_target,match_id_to_penalize,'trolling_penalty',match_id_to_penalize::text,-9);
      END IF;
      UPDATE player_report_state SET strikes=strikes+1,cycle=cycle+1,banned_until=CASE WHEN strikes+1>=3 THEN 'infinity'::timestamptz ELSE now()+make_interval(hours=>report_ban_hours(strikes+1)) END,eligible_since=CASE WHEN strikes+1>=3 THEN 'infinity'::timestamptz ELSE now()+make_interval(hours=>report_ban_hours(strikes+1)) END WHERE target_id=p_target;
      DELETE FROM queue WHERE user_id=p_target;
    END IF;
  ELSE
    RAISE EXCEPTION 'Ação inválida.';
  END IF;
  INSERT INTO mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'report_'||p_action,p_target,trim(p_reason));
  RETURN true;
END $function$;