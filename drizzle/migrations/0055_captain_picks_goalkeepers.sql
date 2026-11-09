-- Goalkeepers are no longer pre-placed: they enter the pickable pool and the
-- captains choose them. Phase 'gk' runs first (the higher-MMR captain opens it),
-- then the usual A-B-B-A-A-B-B-A line draft, clamped so each side lands on five.

CREATE OR REPLACE FUNCTION public.draft_phase(p_match uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN g.free > 0 AND (g.has_a = 0 OR g.has_b = 0) THEN 'gk' ELSE 'line' END
  FROM (
    SELECT count(*) FILTER (WHERE team IS NULL AND position = 'Goleiro') AS free,
           count(*) FILTER (WHERE team = 'a' AND position = 'Goleiro') AS has_a,
           count(*) FILTER (WHERE team = 'b' AND position = 'Goleiro') AS has_b
    FROM public.match_players
    WHERE match_id = p_match
  ) g;
$$;

-- A pick is only legal while it belongs to the group being drafted: goalkeepers
-- first, outfield players afterwards.
CREATE OR REPLACE FUNCTION public.draft_target_ok(p_match uuid, p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_players mp
    WHERE mp.match_id = p_match
      AND mp.user_id = p_target
      AND mp.team IS NULL
      AND (public.draft_phase(p_match) = 'line') = (mp.position <> 'Goleiro')
  );
$$;

CREATE OR REPLACE FUNCTION public.draft_turn(p_match uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first text; v_pool integer; v_left integer; v_a integer; v_b integer; v_pattern text;
  v_gk_a integer; v_gk_b integer; v_gk_free integer; v_ra integer; v_rb integer;
BEGIN
  SELECT m.draft_first_team, m.draft_pool INTO v_first, v_pool FROM public.matches m WHERE m.id = p_match;
  IF v_first IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) FILTER (WHERE team = 'a' AND position = 'Goleiro'),
         count(*) FILTER (WHERE team = 'b' AND position = 'Goleiro'),
         count(*) FILTER (WHERE team IS NULL AND position = 'Goleiro')
    INTO v_gk_a, v_gk_b, v_gk_free
    FROM public.match_players WHERE match_id = p_match;

  -- Goalkeeper round: the captain with the higher MMR picks a keeper first, then
  -- the side still without one takes the remaining keeper.
  IF v_gk_free > 0 AND (v_gk_a = 0 OR v_gk_b = 0) THEN
    IF v_gk_a = 0 AND v_gk_b = 0 THEN
      SELECT rating_before INTO v_ra FROM public.match_players
        WHERE match_id = p_match AND user_id = (SELECT captain_a FROM public.matches WHERE id = p_match);
      SELECT rating_before INTO v_rb FROM public.match_players
        WHERE match_id = p_match AND user_id = (SELECT captain_b FROM public.matches WHERE id = p_match);
      IF v_ra IS NULL OR v_rb IS NULL THEN RETURN NULL; END IF;
      RETURN CASE WHEN v_ra >= v_rb THEN 'a' ELSE 'b' END;
    ELSIF v_gk_a = 0 THEN RETURN 'a';
    ELSE RETURN 'b';
    END IF;
  END IF;

  -- Line round: the fixed A-B-B-A-A-B-B-A rhythm, clamped so neither side can be
  -- pushed past five players.
  SELECT count(*) FILTER (WHERE team IS NULL AND position <> 'Goleiro'),
         count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b')
    INTO v_left, v_a, v_b FROM public.match_players WHERE match_id = p_match;
  IF 5 - v_a <= 0 THEN RETURN 'b'; END IF;
  IF 5 - v_b <= 0 THEN RETURN 'a'; END IF;
  IF v_left = 5 - v_a THEN RETURN 'a'; END IF;
  IF v_left = 5 - v_b THEN RETURN 'b'; END IF;
  v_pattern := public.draft_step(GREATEST(0, v_pool - v_left))->>'turn';
  IF v_pattern = 'a' THEN RETURN v_first; END IF;
  RETURN CASE WHEN v_first = 'a' THEN 'b' ELSE 'a' END;
END $$;

CREATE OR REPLACE FUNCTION public.draft_assign(p_match uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pool integer; v_turn text; v_left integer; v_lines integer; v_a integer; v_b integer;
BEGIN
  SELECT draft_pool INTO v_pool FROM public.matches WHERE id = p_match AND status = 'draft';
  IF v_pool IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_left FROM public.match_players WHERE match_id = p_match AND team IS NULL;
  IF v_left = 0 THEN RETURN; END IF;
  v_turn := public.draft_turn(p_match);
  IF v_turn IS NULL THEN RETURN; END IF;
  IF NOT public.draft_target_ok(p_match, p_target) THEN RETURN; END IF;
  UPDATE public.match_players SET team = v_turn WHERE match_id = p_match AND user_id = p_target AND team IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE team IS NULL),
         count(*) FILTER (WHERE team IS NULL AND position <> 'Goleiro'),
         count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b')
    INTO v_left, v_lines, v_a, v_b FROM public.match_players WHERE match_id = p_match;
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
  UPDATE public.matches SET deadline = now() + make_interval(secs => (public.draft_step(v_pool - v_lines)->>'seconds')::integer)
    WHERE id = p_match AND status = 'draft';
END $$;

CREATE OR REPLACE FUNCTION public.draft_tick(p_match uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_target uuid;
BEGIN
  PERFORM 1 FROM public.matches WHERE id = p_match AND status = 'draft' AND deadline < now() FOR UPDATE;
  IF FOUND THEN
    SELECT user_id INTO v_target FROM public.match_players
     WHERE match_id = p_match AND team IS NULL
       AND (public.draft_phase(p_match) = 'line') = (position <> 'Goleiro')
     ORDER BY random() LIMIT 1;
    IF v_target IS NOT NULL THEN PERFORM public.draft_assign(p_match, v_target); END IF;
  END IF;
  PERFORM public.ghost_autopick(p_match);
END $$;

CREATE OR REPLACE FUNCTION public.ghost_autopick(p_match uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_turn text; v_cap uuid; v_target uuid;
BEGIN
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.match_players WHERE match_id = p_match AND team IS NULL);
    v_turn := public.draft_turn(p_match);
    EXIT WHEN v_turn IS NULL;
    SELECT CASE WHEN v_turn = 'a' THEN captain_a ELSE captain_b END INTO v_cap FROM public.matches WHERE id = p_match;
    EXIT WHEN v_cap IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_cap AND is_ghost);
    SELECT user_id INTO v_target FROM public.match_players
     WHERE match_id = p_match AND team IS NULL
       AND (public.draft_phase(p_match) = 'line') = (position <> 'Goleiro')
     ORDER BY rating_before DESC LIMIT 1;
    EXIT WHEN v_target IS NULL;
    PERFORM public.draft_assign(p_match, v_target);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.draft_pick(p_target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF public.draft_phase(v_match) = 'gk' AND NOT EXISTS (
        SELECT 1 FROM public.match_players WHERE match_id = v_match AND user_id = p_target AND position = 'Goleiro') THEN
    RAISE EXCEPTION 'escolha_goleiro';
  END IF;
  IF public.draft_phase(v_match) = 'line' AND EXISTS (
        SELECT 1 FROM public.match_players WHERE match_id = v_match AND user_id = p_target AND position = 'Goleiro') THEN
    RAISE EXCEPTION 'escolha_linha';
  END IF;
  PERFORM public.draft_assign(v_match, p_target);
  PERFORM public.ghost_autopick(v_match);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.draft_tick_gk()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_match uuid; v_deadline timestamptz; v_status text; v_left integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  -- Recover a full queue even if bots arrived after the last human join.
  IF EXISTS (SELECT 1 FROM public.queue WHERE user_id=auth.uid()) THEN
    PERFORM public.try_matchmake_gk();
  END IF;
  SELECT m.id INTO v_match FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id
    WHERE mp.user_id=auth.uid() AND m.status='draft' ORDER BY m.created_at DESC LIMIT 1;
  IF v_match IS NULL THEN RETURN NULL; END IF;
  PERFORM public.draft_tick(v_match);
  SELECT deadline,status INTO v_deadline,v_status FROM public.matches WHERE id=v_match;
  IF v_status <> 'draft' THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_left FROM public.match_players WHERE match_id=v_match AND team IS NULL;
  RETURN json_build_object('deadline',v_deadline,'turn',public.draft_turn(v_match),
    'picksLeft',CASE WHEN v_left > 0 THEN 1 ELSE 0 END,'phase',public.draft_phase(v_match));
END $$;

CREATE OR REPLACE FUNCTION public.try_matchmake_gk()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gks uuid[]; v_out uuid[]; v_match uuid;
  v_caps uuid[]; v_t1 text; v_t2 text; v_a integer; v_b integer;
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
  -- Everyone, goalkeepers included, starts in the pool for the captains to choose.
  INSERT INTO public.match_players(match_id, user_id, team, position, rating_before)
    SELECT v_match, g.user_id, NULL, 'Goleiro', p.rating
    FROM unnest(v_gks) g(user_id) JOIN public.profiles p ON p.id = g.user_id;
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
  SELECT count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b') INTO v_a, v_b
    FROM public.match_players WHERE match_id = v_match;
  UPDATE public.matches SET
    captain_a = (SELECT user_id FROM public.match_players WHERE match_id = v_match AND user_id = ANY(v_caps) AND team = 'a'),
    captain_b = (SELECT user_id FROM public.match_players WHERE match_id = v_match AND user_id = ANY(v_caps) AND team = 'b'),
    draft_pool = (SELECT count(*)::integer FROM public.match_players WHERE match_id = v_match AND team IS NULL AND position <> 'Goleiro'),
    draft_first_team = CASE WHEN v_a = v_b THEN (CASE WHEN random() < 0.5 THEN 'a' ELSE 'b' END)
                           WHEN v_a > v_b THEN 'a' ELSE 'b' END
    WHERE id = v_match;
END $$;
