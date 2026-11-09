-- Saída rápida no matchmaking: com a fila incompleta, nem tenta o cadeado nem varre a fila.
CREATE OR REPLACE FUNCTION public.try_matchmake_gk()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gks uuid[]; v_out uuid[]; v_match uuid;
  v_caps uuid[]; v_t1 text; v_t2 text; v_a integer; v_b integer;
BEGIN
  IF (SELECT count(*) FROM public.queue) < 10 THEN RETURN; END IF;
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
END $function$;

-- Índice composto para o histórico de partidas (status + mais recentes primeiro)
CREATE INDEX IF NOT EXISTS matches_status_completed_idx ON public.matches (status, completed_at DESC);