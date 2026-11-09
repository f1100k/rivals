-- Mix uses the same first-come 10 players as the normal queue (no waiting for specific positions); positions are spread evenly between the sides.
CREATE OR REPLACE FUNCTION public.mix_assign_teams_gk(p_match uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v_side text; v_a int; v_b int; v_gka int; v_gkb int; v_pa int; v_pb int;
BEGIN
  PERFORM 1 FROM public.matches WHERE id = p_match AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.matches SET is_mix = true WHERE id = p_match;
  FOR r IN SELECT user_id FROM public.match_players WHERE match_id = p_match AND team IS NULL AND position = 'Goleiro' ORDER BY random() LOOP
    SELECT count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b'),
           count(*) FILTER (WHERE team = 'a' AND position = 'Goleiro'), count(*) FILTER (WHERE team = 'b' AND position = 'Goleiro')
      INTO v_a, v_b, v_gka, v_gkb FROM public.match_players WHERE match_id = p_match;
    v_side := CASE WHEN v_gka = 0 AND v_gkb = 0 THEN (CASE WHEN random() < 0.5 THEN 'a' ELSE 'b' END)
                   WHEN v_gka = 0 AND v_a < 5 THEN 'a' WHEN v_gkb = 0 AND v_b < 5 THEN 'b'
                   WHEN v_a <= v_b THEN 'a' ELSE 'b' END;
    UPDATE public.match_players SET team = v_side WHERE match_id = p_match AND user_id = r.user_id;
  END LOOP;
  -- Line players grouped by position (biggest group first), highest MMR first inside each group:
  -- each goes to the side with fewer of that position, then fewer players, then coin flip.
  FOR r IN
    SELECT mp.user_id, mp.position FROM public.match_players mp
    WHERE mp.match_id = p_match AND mp.team IS NULL
    ORDER BY (SELECT count(*) FROM public.match_players x WHERE x.match_id = p_match AND x.position = mp.position) DESC,
             mp.position, mp.rating_before DESC, random()
  LOOP
    SELECT count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b'),
           count(*) FILTER (WHERE team = 'a' AND position = r.position), count(*) FILTER (WHERE team = 'b' AND position = r.position)
      INTO v_a, v_b, v_pa, v_pb FROM public.match_players WHERE match_id = p_match;
    v_side := CASE WHEN v_a >= 5 THEN 'b' WHEN v_b >= 5 THEN 'a'
                   WHEN v_pa < v_pb THEN 'a' WHEN v_pb < v_pa THEN 'b'
                   WHEN v_a < v_b THEN 'a' WHEN v_b < v_a THEN 'b'
                   WHEN random() < 0.5 THEN 'a' ELSE 'b' END;
    UPDATE public.match_players SET team = v_side WHERE match_id = p_match AND user_id = r.user_id;
  END LOOP;
  UPDATE public.matches SET status = 'room', deadline = NULL, draft_pool = 0 WHERE id = p_match AND status = 'draft';
END $function$;
REVOKE ALL ON FUNCTION public.mix_assign_teams_gk(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.try_matchmake_pool_gk(p_test boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gks uuid[]; v_out uuid[]; v_match uuid;
  v_caps uuid[]; v_t1 text; v_t2 text; v_a integer; v_b integer;
  v_mix boolean := public.mix_active();
BEGIN PERFORM public.backfill_match_gk(id) FROM public.matches WHERE (region='TESTE')=p_test AND status IN('draft','room','voting','reporting','disputed') AND EXISTS(SELECT 1 FROM public.match_replacements r WHERE r.match_id=matches.id AND r.replacement_id IS NULL);
  IF (SELECT count(*) FROM public.queue WHERE (region = 'TESTE') = p_test) < 10 THEN RETURN; END IF;
  IF NOT pg_try_advisory_xact_lock(52719, CASE WHEN p_test THEN 16 ELSE 6 END) THEN RETURN; END IF;
  SELECT array_agg(q.user_id ORDER BY q.joined_at, q.id) INTO v_gks FROM (
    SELECT q.user_id, q.joined_at, q.id FROM public.queue q WHERE q.position = 'Goleiro' AND (q.region = 'TESTE') = p_test
    AND NOT EXISTS (SELECT 1 FROM public.match_players mp JOIN public.matches m ON m.id = mp.match_id
      WHERE mp.user_id = q.user_id AND m.status IN ('ready','lobby','draft','room','voting','reporting','disputed'))
    ORDER BY q.joined_at, q.id LIMIT 2 FOR UPDATE OF q SKIP LOCKED
  ) q;
  IF coalesce(cardinality(v_gks), 0) < 2 THEN RETURN; END IF;
  SELECT array_agg(q.user_id ORDER BY q.joined_at, q.id) INTO v_out FROM (
    SELECT q.user_id, q.joined_at, q.id FROM public.queue q WHERE q.position IS NOT NULL AND q.position <> 'Goleiro' AND (q.region = 'TESTE') = p_test
    AND NOT EXISTS (SELECT 1 FROM public.match_players mp JOIN public.matches m ON m.id = mp.match_id
      WHERE mp.user_id = q.user_id AND m.status IN ('ready','lobby','draft','room','voting','reporting','disputed'))
    ORDER BY q.joined_at, q.id LIMIT 8 FOR UPDATE OF q SKIP LOCKED
  ) q;
  IF coalesce(cardinality(v_out), 0) < 8 THEN RETURN; END IF;
  INSERT INTO public.matches(mode, region, status, deadline, draft_pool) VALUES (5, CASE WHEN p_test THEN 'TESTE' ELSE 'SA' END, 'draft', now() + interval '30 seconds', 8) RETURNING id INTO v_match;
  INSERT INTO public.match_players(match_id, user_id, team, position, rating_before)
    SELECT v_match, g.user_id, NULL, 'Goleiro', p.rating
    FROM unnest(v_gks) g(user_id) JOIN public.profiles p ON p.id = g.user_id;
  INSERT INTO public.match_players(match_id, user_id, team, position, rating_before)
    SELECT v_match, q.user_id, NULL, q.position, p.rating FROM public.queue q JOIN public.profiles p ON p.id = q.user_id WHERE q.user_id = ANY(v_out);
  DELETE FROM public.queue WHERE user_id = ANY(v_gks) OR user_id = ANY(v_out);
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
  IF v_mix THEN PERFORM public.mix_assign_teams_gk(v_match); END IF;
END $function$;