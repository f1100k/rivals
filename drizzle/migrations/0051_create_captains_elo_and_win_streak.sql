-- The pool that enters the draft is recorded so the turn order can be counted.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS draft_pool integer NOT NULL DEFAULT 8;

-- Division helper shared with the app's own ladder (100 MMR per division, Elite Div 3 is the cap).
CREATE OR REPLACE FUNCTION public.rank_step_of(p_rating integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT GREATEST(0, LEAST(17, FLOOR(GREATEST(0, COALESCE(p_rating, 0)) / 100)::integer));
$$;
CREATE OR REPLACE FUNCTION public.rank_label(p_rating integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (ARRAY['Bronze','Prata','Ouro','Platina','Diamante','Elite'])[FLOOR(public.rank_step_of(p_rating) / 3) + 1]
    || ' · Div ' || ((public.rank_step_of(p_rating) % 3) + 1);
$$;
GRANT EXECUTE ON FUNCTION public.rank_step_of(integer), public.rank_label(integer) TO public;

-- Draft order: A, B, B, A, A, B, B, A - one player per turn, 30 seconds each.
CREATE OR REPLACE FUNCTION public.draft_step(p_count integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'turn', CASE WHEN p_count <= 0 THEN 'a' WHEN p_count < 3 THEN 'b' WHEN p_count < 5 THEN 'a' WHEN p_count < 7 THEN 'b' ELSE 'a' END,
    'picksLeft', CASE WHEN p_count < 8 THEN 1 ELSE 0 END,
    'seconds', 30);
$$;

-- Whose turn it is: the pattern is mapped onto the side that still needs more players,
-- and a side that is already full never receives another pick.
CREATE OR REPLACE FUNCTION public.draft_turn(p_match uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_first text; v_pool integer; v_left integer; v_a integer; v_b integer; v_pattern text; v_first_side text;
BEGIN
  SELECT m.draft_first_team, m.draft_pool INTO v_first, v_pool FROM public.matches m WHERE m.id = p_match;
  IF v_first IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) FILTER (WHERE team IS NULL), count(*) FILTER (WHERE team='a'), count(*) FILTER (WHERE team='b')
    INTO v_left, v_a, v_b FROM public.match_players WHERE match_id = p_match;
  IF v_a >= 5 THEN RETURN 'b'; END IF;
  IF v_b >= 5 THEN RETURN 'a'; END IF;
  IF (5 - v_a) > (5 - v_b) THEN v_first_side := 'a';
  ELSIF (5 - v_b) > (5 - v_a) THEN v_first_side := 'b';
  ELSE v_first_side := v_first;
  END IF;
  v_pattern := public.draft_step(GREATEST(0, v_pool - v_left))->>'turn';
  IF v_pattern = 'a' THEN RETURN v_first_side; END IF;
  RETURN CASE WHEN v_first_side = 'a' THEN 'b' ELSE 'a' END;
END $$;

-- Assign one player to the side on turn; a full side sends everything left to the other.
CREATE OR REPLACE FUNCTION public.draft_assign(p_match uuid, p_target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pool integer; v_turn text; v_left integer; v_a integer; v_b integer;
BEGIN
  SELECT draft_pool INTO v_pool FROM public.matches WHERE id = p_match AND status = 'draft';
  IF v_pool IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_left FROM public.match_players WHERE match_id = p_match AND team IS NULL;
  IF v_left = 0 THEN RETURN; END IF;
  v_turn := public.draft_turn(p_match);
  IF v_turn IS NULL THEN RETURN; END IF;
  UPDATE public.match_players SET team = v_turn WHERE match_id = p_match AND user_id = p_target AND team IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE team IS NULL), count(*) FILTER (WHERE team='a'), count(*) FILTER (WHERE team='b')
    INTO v_left, v_a, v_b FROM public.match_players WHERE match_id = p_match;
  IF v_a >= 5 THEN
    UPDATE public.match_players SET team = 'b' WHERE match_id = p_match AND team IS NULL;
    UPDATE public.matches SET status = 'room', deadline = NULL WHERE id = p_match AND status = 'draft';
    RETURN;
  END IF;
  IF v_b >= 5 THEN
    UPDATE public.match_players SET team = 'a' WHERE match_id = p_match AND team IS NULL;
    UPDATE public.matches SET status = 'room', deadline = NULL WHERE id = p_match AND status = 'draft';
    RETURN;
  END IF;
  IF v_left = 0 THEN
    UPDATE public.matches SET status = 'room', deadline = NULL WHERE id = p_match AND status = 'draft';
    RETURN;
  END IF;
  UPDATE public.matches SET deadline = now() + make_interval(secs => (public.draft_step(v_pool - v_left)->>'seconds')::integer)
    WHERE id = p_match AND status = 'draft';
END $$;

-- A timed-out turn loses one random player.
CREATE OR REPLACE FUNCTION public.draft_tick(p_match uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_target uuid;
BEGIN
  PERFORM 1 FROM public.matches WHERE id = p_match AND status = 'draft' AND deadline < now() FOR UPDATE;
  IF FOUND THEN
    SELECT user_id INTO v_target FROM public.match_players WHERE match_id = p_match AND team IS NULL ORDER BY random() LIMIT 1;
    IF v_target IS NOT NULL THEN PERFORM public.draft_assign(p_match, v_target); END IF;
  END IF;
  PERFORM public.ghost_autopick(p_match);
END $$;

-- A ghost captain picks the strongest available player immediately.
CREATE OR REPLACE FUNCTION public.ghost_autopick(p_match uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_turn text; v_cap uuid; v_target uuid;
BEGIN
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.match_players WHERE match_id = p_match AND team IS NULL);
    v_turn := public.draft_turn(p_match);
    EXIT WHEN v_turn IS NULL;
    SELECT CASE WHEN v_turn = 'a' THEN captain_a ELSE captain_b END INTO v_cap FROM public.matches WHERE id = p_match;
    EXIT WHEN v_cap IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_cap AND is_ghost);
    SELECT user_id INTO v_target FROM public.match_players WHERE match_id = p_match AND team IS NULL ORDER BY rating_before DESC LIMIT 1;
    EXIT WHEN v_target IS NULL;
    PERFORM public.draft_assign(p_match, v_target);
  END LOOP;
END $$;

-- Only the captain of the side on turn may pick, and the captain comes from MMR.
CREATE OR REPLACE FUNCTION public.draft_pick(p_target uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_match uuid; v_turn text; v_cap uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.id INTO v_match FROM public.match_players mp JOIN public.matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_uid AND m.status = 'draft' ORDER BY m.created_at DESC LIMIT 1;
  IF v_match IS NULL THEN RAISE EXCEPTION 'sem_partida_em_escolha'; END IF;
  PERFORM public.draft_tick(v_match);
  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = v_match AND status = 'draft') THEN RETURN true; END IF;
  v_turn := public.draft_turn(v_match);
  SELECT CASE WHEN v_turn = 'a' THEN captain_a ELSE captain_b END INTO v_cap FROM public.matches WHERE id = v_match;
  IF v_cap IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'nao_e_sua_vez'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.match_players WHERE match_id = v_match AND user_id = p_target AND team IS NULL) THEN
    RAISE EXCEPTION 'jogador_indisponivel';
  END IF;
  PERFORM public.draft_assign(v_match, p_target);
  PERFORM public.ghost_autopick(v_match);
  RETURN true;
END $$;

-- Matchmaking: the two highest MMR become captains and must land on opposite sides.
CREATE OR REPLACE FUNCTION public.try_matchmake_gk()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gks uuid[]; v_out uuid[]; v_match uuid; v_swap boolean := random() < 0.5;
  v_caps uuid[]; v_t1 text; v_t2 text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(52719, 5) THEN RETURN; END IF;
  SELECT array_agg(q.user_id ORDER BY q.joined_at, q.id) INTO v_gks FROM (
    SELECT q.user_id, q.joined_at, q.id FROM public.queue q WHERE q.position = 'Goleiro'
    AND NOT EXISTS (SELECT 1 FROM public.match_players mp JOIN public.matches m ON m.id = mp.match_id
      WHERE mp.user_id = q.user_id AND m.status IN ('ready','lobby','draft','room','voting','reporting','disputed'))
    ORDER BY q.joined_at, q.id LIMIT 2 FOR UPDATE OF q SKIP LOCKED
  ) q;
  IF coalesce(cardinality(v_gks), 0) < 2 THEN RETURN; END IF;
  SELECT array_agg(q.user_id ORDER BY q.joined_at, q.id) INTO v_out FROM (
    SELECT q.user_id, q.joined_at, q.id FROM public.queue q WHERE q.position IS NOT NULL AND q.position <> 'Goleiro'
    AND NOT EXISTS (SELECT 1 FROM public.match_players mp JOIN public.matches m ON m.id = mp.match_id
      WHERE mp.user_id = q.user_id AND m.status IN ('ready','lobby','draft','room','voting','reporting','disputed'))
    ORDER BY q.joined_at, q.id LIMIT 8 FOR UPDATE OF q SKIP LOCKED
  ) q;
  IF coalesce(cardinality(v_out), 0) < 8 THEN RETURN; END IF;
  INSERT INTO public.matches(mode, region, status, deadline, draft_pool) VALUES (5, 'SA', 'draft', now() + interval '30 seconds', 8) RETURNING id INTO v_match;
  INSERT INTO public.match_players(match_id, user_id, team, position, rating_before)
    SELECT v_match, g.user_id, CASE WHEN (g.rn = 1) <> v_swap THEN 'a' ELSE 'b' END, 'Goleiro', p.rating
    FROM unnest(v_gks) WITH ORDINALITY g(user_id, rn) JOIN public.profiles p ON p.id = g.user_id;
  INSERT INTO public.match_players(match_id, user_id, team, position, rating_before)
    SELECT v_match, q.user_id, NULL, q.position, p.rating FROM public.queue q JOIN public.profiles p ON p.id = q.user_id WHERE q.user_id = ANY(v_out);
  DELETE FROM public.queue WHERE user_id = ANY(v_gks) OR user_id = ANY(v_out);

  -- Captains: the two highest MMR of the ten, never in the same team.
  SELECT array_agg(c.user_id ORDER BY c.rn) INTO v_caps FROM (
    SELECT u.user_id, ROW_NUMBER() OVER (ORDER BY p.rating DESC, u.user_id) rn
    FROM (SELECT unnest(v_gks) user_id UNION SELECT unnest(v_out)) u
    JOIN public.profiles p ON p.id = u.user_id LIMIT 2
  ) c;
  IF coalesce(cardinality(v_caps), 0) < 2 THEN RETURN; END IF;
  SELECT team INTO v_t1 FROM public.match_players WHERE match_id = v_match AND user_id = v_caps[1];
  SELECT team INTO v_t2 FROM public.match_players WHERE match_id = v_match AND user_id = v_caps[2];
  IF v_t1 IS NULL AND v_t2 IS NULL THEN
    UPDATE public.match_players SET team = 'a' WHERE match_id = v_match AND user_id = v_caps[1];
    UPDATE public.match_players SET team = 'b' WHERE match_id = v_match AND user_id = v_caps[2];
  ELSIF v_t1 IS NULL THEN
    UPDATE public.match_players SET team = CASE WHEN v_t2 = 'a' THEN 'b' ELSE 'a' END WHERE match_id = v_match AND user_id = v_caps[1];
  ELSIF v_t2 IS NULL THEN
    UPDATE public.match_players SET team = CASE WHEN v_t1 = 'a' THEN 'b' ELSE 'a' END WHERE match_id = v_match AND user_id = v_caps[2];
  END IF;
  UPDATE public.matches SET
    captain_a = (SELECT user_id FROM public.match_players WHERE match_id = v_match AND user_id = ANY(v_caps) AND team = 'a'),
    captain_b = (SELECT user_id FROM public.match_players WHERE match_id = v_match AND user_id = ANY(v_caps) AND team = 'b'),
    draft_pool = (SELECT count(*)::integer FROM public.match_players WHERE match_id = v_match AND team IS NULL)
    WHERE id = v_match;
END $$;

-- Scoring: chess Elo with K = 32 on the pre-match averages, plus the exponential win-streak bonus.
CREATE OR REPLACE FUNCTION public.finalize_match_gk(p_match uuid, p_a integer, p_b integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a numeric; b numeric; winner text; e_a numeric; r record; w point_protection_wallets;
        tier integer; t integer; bot_match boolean;
        v_enabled boolean; v_max_bonus integer; v_max_streak integer;
        v_elo numeric; v_streak integer; v_bonus integer; v_total integer; v_cap integer;
        v_before integer; v_after integer;
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

-- The screen needs to know who the captains are and how each result was built.
CREATE OR REPLACE FUNCTION public.get_inhouse_state_gk()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_me json; v_queue json; v_counts json; v_match json; v_last json;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT (to_jsonb(p) || jsonb_build_object('isStaff', public.is_staff(v_uid)))::json INTO v_me FROM profiles p WHERE p.id = v_uid;
  SELECT to_jsonb(q)::json INTO v_queue FROM queue q WHERE q.user_id = v_uid;
  SELECT json_build_object('total', count(*), 'goalkeepers', count(*) FILTER(WHERE position = 'Goleiro'), 'outfield', count(*) FILTER(WHERE position IS NOT NULL AND position <> 'Goleiro')) INTO v_counts FROM queue WHERE position IS NOT NULL;
  SELECT to_jsonb(x)::json INTO v_match FROM (
    SELECT m.id, m.status, m.room_code AS "roomCode", m.created_at AS "createdAt", m.report_a AS "reportA", m.report_b AS "reportB",
      (SELECT name FROM profiles WHERE id = m.reported_by) AS "reportedBy",
      m.captain_a AS "captainA", m.captain_b AS "captainB",
      coalesce(json_agg(json_build_object('userId', mp.user_id, 'name', pr.name, 'avatarUrl', pr.avatar_url, 'rating', mp.rating_before,
        'position', mp.position, 'primaryPosition', pr.primary_position, 'secondaryPosition', pr.secondary_position,
        'team', mp.team, 'vote', mp.vote, 'cancelVote', mp.cancel_vote, 'confirm', mp.confirm, 'isMe', mp.user_id = v_uid,
        'isCaptain', mp.user_id IN (m.captain_a, m.captain_b))
        ORDER BY (mp.user_id IN (m.captain_a, m.captain_b)) DESC, mp.team NULLS LAST, (mp.position = 'Goleiro') DESC, mp.rating_before DESC), '[]'::json) AS players
    FROM matches m JOIN match_players mp ON mp.match_id = m.id JOIN profiles pr ON pr.id = mp.user_id
    WHERE m.status IN ('draft','room','voting','reporting','disputed') AND EXISTS(SELECT 1 FROM match_players mine WHERE mine.match_id = m.id AND mine.user_id = v_uid)
    GROUP BY m.id) x;
  SELECT to_jsonb(h)::json INTO v_last FROM (
    SELECT m.score_a AS "scoreA", m.score_b AS "scoreB", m.completed_at AS "completedAt",
      json_agg(json_build_object('name', pr.name, 'team', mp.team, 'delta', mp.delta,
        'elo', rh.elo_delta, 'bonus', rh.streak_bonus, 'before', rh.rating_before, 'after', rh.rating_after)
        ORDER BY mp.team, mp.rating_before DESC) AS players
    FROM matches m JOIN match_players mp ON mp.match_id = m.id JOIN profiles pr ON pr.id = mp.user_id
    LEFT JOIN public.rating_history rh ON rh.match_id = m.id AND rh.user_id = mp.user_id
    WHERE m.status = 'completed' AND EXISTS(SELECT 1 FROM match_players mine WHERE mine.match_id = m.id AND mine.user_id = v_uid)
    GROUP BY m.id ORDER BY m.completed_at DESC LIMIT 1) h;
  RETURN json_build_object('me', v_me, 'queue', v_queue, 'counts', v_counts, 'match', v_match, 'lastResult', v_last);
END $$;