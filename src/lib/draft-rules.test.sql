-- Isolated shadow tables: no real players, matches or queue entries are touched.
-- Covers the draft order: captains (top MMR) pick lines first in the A-B-B-A rhythm,
-- keepers only at the end, and each side lands on five with exactly one keeper.
BEGIN;
CREATE TEMP TABLE profiles (LIKE public.profiles INCLUDING ALL);
CREATE TEMP TABLE matches (LIKE public.matches INCLUDING ALL);
CREATE TEMP TABLE match_players (LIKE public.match_players INCLUDING ALL);
CREATE TEMP TABLE queue (LIKE public.queue INCLUDING ALL);

-- Clone production bodies into session-local functions so the test role can run them
-- against the shadow tables instead of the real ones.
DO $$
DECLARE name text; definition text; tbl text;
BEGIN
  FOREACH name IN ARRAY ARRAY['try_matchmake_gk','draft_phase','draft_target_ok','draft_turn','draft_assign','draft_tick','draft_pick','ghost_autopick'] LOOP
    SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=name;
    definition := replace(definition, 'FUNCTION public.'||name||'(', 'FUNCTION pg_temp.'||name||'(');
    definition := replace(definition, 'SET search_path TO ''public''', 'SET search_path TO pg_temp, public');
    definition := replace(definition, 'auth.uid()', 'nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid');
    FOREACH tbl IN ARRAY ARRAY['profiles','matches','match_players','queue'] LOOP
      definition := replace(definition, 'public.'||tbl, tbl);
    END LOOP;
    FOREACH tbl IN ARRAY ARRAY['try_matchmake_gk','draft_phase','draft_target_ok','draft_turn','draft_assign','draft_tick','draft_pick','ghost_autopick'] LOOP
      definition := regexp_replace(definition, '\m'||tbl||'\(', 'pg_temp.'||tbl||'(', 'g');
      definition := replace(definition, 'pg_temp.pg_temp.', 'pg_temp.');
      definition := replace(definition, 'public.pg_temp.', 'pg_temp.');
    END LOOP;
    EXECUTE definition;
  END LOOP;
END $$;

DO $$
DECLARE
  ids uuid[] := '{}'; ids2 uuid[] := '{}'; ids3 uuid[] := '{}';
  m uuid; m2 uuid; m3 uuid; i integer; t text; turns text[] := '{}'; first text;
BEGIN
  -- ---------- A: matchmaking + lines first, keepers last ----------
  FOR i IN 1..10 LOOP
    ids := array_append(ids, gen_random_uuid());
    INSERT INTO profiles(id, name, rating) VALUES(ids[i], 'Draft order test '||i, (11 - i) * 100);
    INSERT INTO queue(user_id, mode, region, position, joined_at)
      VALUES(ids[i], 5, 'SA', CASE WHEN i >= 9 THEN 'Goleiro' ELSE 'Pivô' END, now() + make_interval(secs => i));
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', ids[1]::text, true);
  PERFORM pg_temp.try_matchmake_gk();
  SELECT id, draft_first_team INTO m, first FROM matches WHERE status = 'draft';
  IF m IS NULL THEN RAISE EXCEPTION 'ten queued players must form a draft'; END IF;
  IF pg_temp.draft_phase(m) <> 'line' THEN RAISE EXCEPTION 'the draft must open with lines'; END IF;
  IF pg_temp.draft_target_ok(m, ids[9]) IS NOT FALSE THEN RAISE EXCEPTION 'keepers must wait until the end'; END IF;
  IF pg_temp.draft_turn(m) <> first THEN RAISE EXCEPTION 'the random first side must open'; END IF;

  FOR i IN 1..8 LOOP
    EXIT WHEN (SELECT status FROM matches WHERE id = m) <> 'draft';
    t := pg_temp.draft_turn(m);
    turns := array_append(turns, t);
    PERFORM pg_temp.draft_assign(m, (SELECT user_id FROM match_players WHERE match_id = m AND team IS NULL
      AND pg_temp.draft_target_ok(m, user_id) ORDER BY rating_before DESC LIMIT 1));
    IF i = 6 AND pg_temp.draft_phase(m) <> 'gk' THEN RAISE EXCEPTION 'after six lines the keeper round must open'; END IF;
  END LOOP;
  FOR i IN 1..least(7, coalesce(array_length(turns, 1), 0)) LOOP
    IF turns[i] <> public.draft_team(i - 1, first) THEN
      RAISE EXCEPTION 'picks must keep the A-B-B-A-A-B-B-A rhythm, got %', turns;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM match_players WHERE match_id = m AND team = 'a' AND position = 'Goleiro') <> 1
     OR (SELECT count(*) FROM match_players WHERE match_id = m AND team = 'b' AND position = 'Goleiro') <> 1
     OR (SELECT count(*) FROM match_players WHERE match_id = m AND team = 'a') <> 5 THEN
    RAISE EXCEPTION 'each side must land on five with exactly one keeper';
  END IF;
  IF (SELECT status FROM matches WHERE id = m) <> 'room' THEN RAISE EXCEPTION 'a full draft must open the room'; END IF;

  -- ---------- B: a keeper captains; his side gets four lines, the other three + keeper ----------
  FOR i IN 1..10 LOOP
    ids2 := array_append(ids2, gen_random_uuid());
    INSERT INTO profiles(id, name, rating) VALUES(ids2[i], 'Keeper captain test '||i, (11 - i) * 100);
  END LOOP;
  INSERT INTO matches(mode, region, status, deadline, draft_pool, draft_first_team)
    VALUES (5, 'SA', 'draft', now() + interval '30 seconds', 8, 'a') RETURNING id INTO m2;
  INSERT INTO match_players(match_id, user_id, team, position, rating_before)
    SELECT m2, ids2[g.n], CASE g.n WHEN 1 THEN 'a' WHEN 2 THEN 'b' END,
      CASE WHEN g.n IN (1, 9) THEN 'Goleiro' ELSE 'Pivô' END, (11 - g.n) * 100
    FROM generate_series(1, 10) AS g(n);
  UPDATE matches SET captain_a = ids2[1], captain_b = ids2[2] WHERE id = m2;
  IF pg_temp.draft_phase(m2) <> 'line' THEN RAISE EXCEPTION 'lines must come first even with a keeper captain'; END IF;
  FOR i IN 1..8 LOOP
    EXIT WHEN (SELECT status FROM matches WHERE id = m2) <> 'draft';
    PERFORM pg_temp.draft_assign(m2, (SELECT user_id FROM match_players WHERE match_id = m2 AND team IS NULL
      AND pg_temp.draft_target_ok(m2, user_id) ORDER BY rating_before DESC LIMIT 1));
  END LOOP;
  IF (SELECT count(*) FROM match_players WHERE match_id = m2 AND team = 'b' AND position = 'Goleiro') <> 1
     OR (SELECT count(*) FROM match_players WHERE match_id = m2 AND team = 'a') <> 5
     OR (SELECT count(*) FROM match_players WHERE match_id = m2 AND team = 'b') <> 5 THEN
    RAISE EXCEPTION 'keeper captain draft must still land on five each with one keeper';
  END IF;

  -- ---------- C: a timed-out turn during the line round draws a line, never a keeper ----------
  FOR i IN 1..10 LOOP
    ids3 := array_append(ids3, gen_random_uuid());
    INSERT INTO profiles(id, name, rating) VALUES(ids3[i], 'Timeout test '||i, (11 - i) * 100);
  END LOOP;
  INSERT INTO matches(mode, region, status, deadline, draft_pool, draft_first_team)
    VALUES (5, 'SA', 'draft', now() - interval '1 second', 8, 'a') RETURNING id INTO m3;
  INSERT INTO match_players(match_id, user_id, team, position, rating_before)
    SELECT m3, ids3[g.n], CASE g.n WHEN 1 THEN 'a' WHEN 2 THEN 'b' END,
      CASE WHEN g.n IN (9, 10) THEN 'Goleiro' ELSE 'Pivô' END, (11 - g.n) * 100
    FROM generate_series(1, 10) AS g(n);
  UPDATE matches SET captain_a = ids3[1], captain_b = ids3[2] WHERE id = m3;
  PERFORM pg_temp.draft_tick(m3);
  IF (SELECT count(*) FROM match_players WHERE match_id = m3 AND team IS NOT NULL AND position = 'Goleiro') <> 0
     OR (SELECT count(*) FROM match_players WHERE match_id = m3 AND team IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'an expired line turn must draw one line, not a keeper';
  END IF;

  RAISE NOTICE 'Draft order tests passed: lines first in the fixed rhythm, keepers last, five per side with one keeper.';
END $$;
ROLLBACK;
