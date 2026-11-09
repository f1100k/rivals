CREATE OR REPLACE FUNCTION public.draft_phase(p_match uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- Line players are drafted first; keepers only after every line slot is filled
  -- (each side keeps one slot reserved for a keeper while it has none).
  SELECT CASE WHEN g.free_line > 0 AND (
            (5 - g.n_a - CASE WHEN g.gk_a = 0 THEN 1 ELSE 0 END) > 0 OR
            (5 - g.n_b - CASE WHEN g.gk_b = 0 THEN 1 ELSE 0 END) > 0)
         THEN 'line' ELSE 'gk' END
  FROM (
    SELECT count(*) FILTER (WHERE team IS NULL AND position IS DISTINCT FROM 'Goleiro') AS free_line,
           count(*) FILTER (WHERE team = 'a') AS n_a, count(*) FILTER (WHERE team = 'b') AS n_b,
           count(*) FILTER (WHERE team = 'a' AND position = 'Goleiro') AS gk_a,
           count(*) FILTER (WHERE team = 'b' AND position = 'Goleiro') AS gk_b
    FROM public.match_players WHERE match_id = p_match
  ) g;
$function$;

CREATE OR REPLACE FUNCTION public.draft_target_ok(p_match uuid, p_target uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.match_players mp
    WHERE mp.match_id = p_match AND mp.user_id = p_target AND mp.team IS NULL
      AND CASE
        WHEN public.draft_phase(p_match) = 'line' THEN mp.position IS DISTINCT FROM 'Goleiro'
        WHEN EXISTS (SELECT 1 FROM public.match_players x WHERE x.match_id = p_match AND x.team IS NULL AND x.position = 'Goleiro')
          THEN mp.position = 'Goleiro'
        ELSE true END
  );
$function$;

CREATE OR REPLACE FUNCTION public.draft_turn(p_match uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_first text; v_free integer; v_a integer; v_b integer; v_gk_a integer; v_gk_b integer;
  v_t text; v_o text; v_cap_a integer; v_cap_b integer; v_phase text;
BEGIN
  SELECT m.draft_first_team INTO v_first FROM public.matches m WHERE m.id = p_match;
  IF v_first IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) FILTER (WHERE team IS NULL), count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b'),
         count(*) FILTER (WHERE team = 'a' AND position = 'Goleiro'), count(*) FILTER (WHERE team = 'b' AND position = 'Goleiro')
    INTO v_free, v_a, v_b, v_gk_a, v_gk_b FROM public.match_players WHERE match_id = p_match;
  IF v_free = 0 THEN RETURN NULL; END IF;
  IF v_a >= 5 THEN RETURN 'b'; END IF;
  IF v_b >= 5 THEN RETURN 'a'; END IF;

  -- Same A-B-B-A-A-B-B-A rhythm over every pick (lines then keepers); first side is random.
  v_t := public.draft_step(GREATEST(0, v_a + v_b - 2))->>'turn';
  v_t := CASE WHEN v_t = 'a' THEN v_first WHEN v_first = 'a' THEN 'b' ELSE 'a' END;
  v_o := CASE WHEN v_t = 'a' THEN 'b' ELSE 'a' END;

  v_phase := public.draft_phase(p_match);
  IF v_phase = 'line' THEN
    v_cap_a := 5 - v_a - CASE WHEN v_gk_a = 0 THEN 1 ELSE 0 END;
    v_cap_b := 5 - v_b - CASE WHEN v_gk_b = 0 THEN 1 ELSE 0 END;
    IF (CASE WHEN v_t = 'a' THEN v_cap_a ELSE v_cap_b END) <= 0 THEN RETURN v_o; END IF;
    RETURN v_t;
  END IF;
  -- Keeper round: a side that already has its keeper hands the turn to the other.
  IF EXISTS (SELECT 1 FROM public.match_players WHERE match_id = p_match AND team IS NULL AND position = 'Goleiro') THEN
    IF (CASE WHEN v_t = 'a' THEN v_gk_a ELSE v_gk_b END) > 0
       AND (CASE WHEN v_o = 'a' THEN v_gk_a ELSE v_gk_b END) = 0 THEN RETURN v_o; END IF;
  END IF;
  RETURN v_t;
END $function$;