CREATE OR REPLACE FUNCTION public.mix_assign_teams_gk(p_match uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v_side text; v_a int; v_b int; v_gka int; v_gkb int; v_pa int; v_pb int; v_n int;
  v_pos text; v_ta int; v_tb int; v_ea int := 0; v_eb int := 0; v_t jsonb := '{}'::jsonb;
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
  -- Target per line position: half each; an odd one out goes to the side holding the captain of that position,
  -- otherwise to the side with fewer odd ones so far (both sides end with the same number of line players).
  FOR v_pos IN
    SELECT p FROM unnest(ARRAY['Pivô','Fixo','Ala']) p
    ORDER BY (SELECT greatest(count(*) FILTER (WHERE x.team = 'a'), count(*) FILTER (WHERE x.team = 'b')) > count(*) / 2
               FROM public.match_players x WHERE x.match_id = p_match AND x.position = p) DESC, random()
  LOOP
    SELECT count(*), count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b')
      INTO v_n, v_pa, v_pb FROM public.match_players WHERE match_id = p_match AND position = v_pos;
    v_ta := v_n / 2; v_tb := v_n / 2;
    IF v_n % 2 = 1 THEN
      v_side := CASE WHEN v_pa > v_n / 2 THEN 'a' WHEN v_pb > v_n / 2 THEN 'b'
                     WHEN v_ea < v_eb THEN 'a' WHEN v_eb < v_ea THEN 'b'
                     WHEN random() < 0.5 THEN 'a' ELSE 'b' END;
      IF v_side = 'a' THEN v_ta := v_ta + 1; v_ea := v_ea + 1; ELSE v_tb := v_tb + 1; v_eb := v_eb + 1; END IF;
    END IF;
    v_t := v_t || jsonb_build_object(v_pos, jsonb_build_array(v_ta, v_tb));
  END LOOP;
  -- Fill each position toward its targets, highest MMR first, coin flip when both sides still need one.
  FOR r IN SELECT user_id, position FROM public.match_players WHERE match_id = p_match AND team IS NULL AND v_t ? position ORDER BY rating_before DESC, random() LOOP
    SELECT count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b'),
           count(*) FILTER (WHERE team = 'a' AND position = r.position), count(*) FILTER (WHERE team = 'b' AND position = r.position)
      INTO v_a, v_b, v_pa, v_pb FROM public.match_players WHERE match_id = p_match;
    v_ta := (v_t -> r.position ->> 0)::int; v_tb := (v_t -> r.position ->> 1)::int;
    v_side := CASE WHEN v_a >= 5 THEN 'b' WHEN v_b >= 5 THEN 'a'
                   WHEN v_ta - v_pa > v_tb - v_pb THEN 'a' WHEN v_tb - v_pb > v_ta - v_pa THEN 'b'
                   WHEN random() < 0.5 THEN 'a' ELSE 'b' END;
    UPDATE public.match_players SET team = v_side WHERE match_id = p_match AND user_id = r.user_id;
  END LOOP;
  -- Anyone left (unexpected position) goes to the smaller side.
  FOR r IN SELECT user_id FROM public.match_players WHERE match_id = p_match AND team IS NULL ORDER BY rating_before DESC LOOP
    SELECT count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b') INTO v_a, v_b FROM public.match_players WHERE match_id = p_match;
    UPDATE public.match_players SET team = CASE WHEN v_a <= v_b THEN 'a' ELSE 'b' END WHERE match_id = p_match AND user_id = r.user_id;
  END LOOP;
  UPDATE public.matches SET status = 'room', deadline = NULL, draft_pool = 0 WHERE id = p_match AND status = 'draft';
END $function$;
REVOKE ALL ON FUNCTION public.mix_assign_teams_gk(uuid) FROM PUBLIC, anon, authenticated;