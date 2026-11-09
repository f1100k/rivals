CREATE OR REPLACE FUNCTION public.lock_competitive_player(p_user uuid)
RETURNS void LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT pg_advisory_xact_lock(52720, hashtext(p_user::text));
$$;
REVOKE ALL ON FUNCTION public.lock_competitive_player(uuid) FROM public, anon, authenticated;

DO $mig$
DECLARE d text; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('activate_point_protection', 'PERFORM public.lock_competitive_player(u)'),
    ('get_point_protection_state', 'PERFORM public.lock_competitive_player(u)'),
    ('lock_competitive_match_entry', 'PERFORM public.lock_competitive_player(NEW.user_id)'),
    ('review_player_report', 'PERFORM public.lock_competitive_player(p_target)'),
    ('submit_player_report', 'PERFORM public.lock_competitive_player(p_target)'),
    ('finalize_match_gk', 'PERFORM public.lock_competitive_player(s.user_id) FROM (SELECT user_id FROM public.match_players WHERE match_id = p_match ORDER BY user_id) s'),
    ('admin_enqueue_test_bots', 'PERFORM pg_advisory_xact_lock(52719, 6)'),
    ('try_matchmake_gk', 'IF NOT pg_try_advisory_xact_lock(52719, 6) THEN RETURN; END IF')
  ) v(fn, repl) LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF d IS NULL THEN RAISE EXCEPTION 'missing %', r.fn; END IF;
    IF r.fn = 'try_matchmake_gk' THEN
      d := regexp_replace(d, 'IF NOT pg_try_advisory_xact_lock\(52719,\s*5\) THEN RETURN; END IF', r.repl, 'g');
    ELSE
      d := regexp_replace(d, 'PERFORM pg_advisory_xact_lock\(52719,\s*5\)', r.repl, 'g');
    END IF;
    IF d ~ '52719,\s*5\)' THEN RAISE EXCEPTION 'lock not replaced in %', r.fn; END IF;
    EXECUTE d;
  END LOOP;
END $mig$;