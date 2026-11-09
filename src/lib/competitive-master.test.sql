-- Isolated shadow tables: no real players, ratings, matches or settings are changed.
-- Covers the PROMPT MASTER rules: captains by MMR, A-B-B-A-A-B-B-A draft,
-- Elo K=32 on team averages, exponential win streak, and the patent ladder limits.
BEGIN;
CREATE TEMP TABLE profiles (LIKE public.profiles INCLUDING ALL);
CREATE TEMP TABLE matches (LIKE public.matches INCLUDING ALL);
CREATE TEMP TABLE match_players (LIKE public.match_players INCLUDING ALL);
CREATE TEMP TABLE queue (LIKE public.queue INCLUDING ALL);
CREATE TEMP TABLE point_protection_wallets (LIKE public.point_protection_wallets INCLUDING ALL);
CREATE TEMP TABLE point_protection_events (LIKE public.point_protection_events INCLUDING ALL);
CREATE TEMP TABLE win_streak_settings (LIKE public.win_streak_settings INCLUDING ALL);
CREATE TEMP TABLE rating_history (LIKE public.rating_history INCLUDING ALL);
CREATE TEMP TABLE rank_history (LIKE public.rank_history INCLUDING ALL);
CREATE TEMP TABLE mod_actions (LIKE public.mod_actions INCLUDING ALL);
CREATE TEMP TABLE user_roles (LIKE public.user_roles INCLUDING ALL);
INSERT INTO win_streak_settings(id) VALUES (true);

-- Clone production bodies into session-local functions so the test role can run them
-- against the shadow tables instead of the real ones.
DO $$
DECLARE name text; definition text; tbl text;
BEGIN
  FOREACH name IN ARRAY ARRAY['refresh_point_wallet','finalize_match_gk','try_matchmake_gk','draft_assign','draft_tick','draft_pick','ghost_autopick','draft_turn','draft_phase','draft_target_ok'] LOOP
    SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=name;
    definition := replace(definition, 'FUNCTION public.'||name||'(', 'FUNCTION pg_temp.'||name||'(');
    definition := replace(definition, 'SET search_path TO ''public''', 'SET search_path TO pg_temp, public');
    definition := replace(definition, 'auth.uid()', 'nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid');
    FOREACH tbl IN ARRAY ARRAY['profiles','matches','match_players','queue','point_protection_wallets','point_protection_events','win_streak_settings','rating_history','rank_history'] LOOP
      definition := replace(definition, 'public.'||tbl, tbl);
    END LOOP;
    FOREACH tbl IN ARRAY ARRAY['refresh_point_wallet','finalize_match_gk','try_matchmake_gk','draft_assign','draft_tick','draft_pick','ghost_autopick','draft_turn','draft_phase','draft_target_ok'] LOOP
      definition := regexp_replace(definition, '\m'||tbl||'\(', 'pg_temp.'||tbl||'(', 'g');
      definition := replace(definition, 'pg_temp.pg_temp.', 'pg_temp.');
      definition := replace(definition, 'public.pg_temp.', 'pg_temp.');
    END LOOP;
    EXECUTE definition;
  END LOOP;
END $$;

-- Clone the bonus-rule controls the same way, with the admin check aimed at the shadow tables.
DO $$
DECLARE name text; definition text;
BEGIN
  FOREACH name IN ARRAY ARRAY['get_win_streak_settings','set_win_streak_settings'] LOOP
    SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=name;
    definition := replace(definition, 'FUNCTION public.'||name||'(', 'FUNCTION pg_temp.'||name||'(');
    definition := replace(definition, 'SET search_path TO ''public''', 'SET search_path TO pg_temp, public');
    definition := replace(definition, 'public.has_role(auth.uid(), ''admin'')',
      'EXISTS(SELECT 1 FROM user_roles WHERE user_id=nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid AND role=''admin'')');
    definition := replace(definition, 'auth.uid()', 'nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid');
    definition := replace(definition, 'public.win_streak_settings', 'win_streak_settings');
    definition := replace(definition, 'public.mod_actions', 'mod_actions');
    EXECUTE definition;
  END LOOP;
END $$;

DO $$
DECLARE ids uuid[]; caps uuid[]; m uuid; m2 uuid; m3 uuid; m4 uuid; i integer; t text; s0 text; other text; admin_id uuid; failed boolean;
        turns text[] := '{}'; before integer; after integer; earned integer; streak integer; expected integer;
BEGIN
  -- ---------- TEST F: patent ladder limits ----------
  IF public.rank_step_of(99) <> 0 OR public.rank_step_of(100) <> 1 THEN RAISE EXCEPTION '99/100 must split Bronze Div 1 and Div 2'; END IF;
  IF public.rank_step_of(299) <> 2 OR public.rank_step_of(300) <> 3 THEN RAISE EXCEPTION '299/300 must split Bronze Div 3 and Prata Div 1'; END IF;
  IF public.rank_step_of(899) <> 8 OR public.rank_step_of(900) <> 9 THEN RAISE EXCEPTION '899/900 must split Ouro Div 3 and Platina Div 1'; END IF;
  IF public.rank_step_of(1499) <> 14 OR public.rank_step_of(1500) <> 15 THEN RAISE EXCEPTION '1499/1500 must split Diamante Div 3 and Elite Div 1'; END IF;
  IF public.rank_step_of(1699) <> 16 OR public.rank_step_of(1700) <> 17 THEN RAISE EXCEPTION '1699/1700 must split Elite Div 2 and Div 3'; END IF;
  IF public.rank_step_of(9000) <> 17 THEN RAISE EXCEPTION 'MMR above 1700 must stay in Elite Div 3'; END IF;
  IF public.rank_label(850) <> 'Ouro · Div 3' THEN RAISE EXCEPTION '850 must read Ouro · Div 3, got %', public.rank_label(850); END IF;
  IF public.rank_label(1700) <> 'Elite · Div 3' THEN RAISE EXCEPTION '1700 must read Elite · Div 3'; END IF;

  -- ---------- TEST A: the two highest MMR become captains on opposite teams ----------
  FOR i IN 1..10 LOOP
    ids := array_append(ids, gen_random_uuid());
    INSERT INTO profiles(id, name, rating) VALUES(ids[i], 'Master test '||i, 100 * i);
    -- ids[10] (1000) and ids[9] (900) queue as goalkeepers, the rest as lines.
    INSERT INTO queue(user_id, mode, region, position, joined_at)
      VALUES(ids[i], 5, 'SA', CASE WHEN i >= 9 THEN 'Goleiro' ELSE 'Pivô' END, now() + make_interval(secs => i));
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', ids[1]::text, true);
  PERFORM pg_temp.try_matchmake_gk();
  SELECT id INTO m FROM matches WHERE status = 'draft';
  IF m IS NULL THEN RAISE EXCEPTION 'ten queued players must form a draft'; END IF;
  SELECT array_agg(user_id ORDER BY rating_before DESC) INTO caps FROM match_players
    WHERE match_id = m AND user_id IN (SELECT captain_a FROM matches WHERE id = m UNION SELECT captain_b FROM matches WHERE id = m);
  IF caps IS NULL OR array_length(caps, 1) <> 2 THEN RAISE EXCEPTION 'both captains must be recorded'; END IF;
  IF (SELECT rating_before FROM match_players WHERE match_id = m AND user_id = caps[1]) <> 1000
     OR (SELECT rating_before FROM match_players WHERE match_id = m AND user_id = caps[2]) <> 900 THEN
    RAISE EXCEPTION 'captains must be the two highest MMR';
  END IF;
  IF (SELECT team FROM match_players WHERE match_id = m AND user_id = caps[1])
   = (SELECT team FROM match_players WHERE match_id = m AND user_id = caps[2]) THEN
    RAISE EXCEPTION 'captains must never share a team';
  END IF;
  IF (SELECT draft_pool FROM matches WHERE id = m) <> 8 THEN RAISE EXCEPTION 'eight players must remain in the pool'; END IF;

  -- ---------- TEST B: the pick order is A, B, B, A, A, B, B, A ----------
  FOR i IN 1..8 LOOP
    t := pg_temp.draft_turn(m);
    turns := array_append(turns, t);
    PERFORM pg_temp.draft_assign(m, (SELECT user_id FROM match_players WHERE match_id = m AND team IS NULL AND pg_temp.draft_target_ok(m, user_id) ORDER BY rating_before DESC LIMIT 1));
  END LOOP;
  s0 := turns[1];
  other := CASE WHEN s0 = 'a' THEN 'b' ELSE 'a' END;
  IF turns[1:7] <> ARRAY[s0, other, other, s0, s0, other, other] OR coalesce(turns[8], s0) <> s0 THEN
    RAISE EXCEPTION 'draft order must be A-B-B-A-A-B-B-A, got %', turns;
  END IF;
  IF (SELECT count(*) FROM match_players WHERE match_id = m AND team = 'a') <> 5
     OR (SELECT count(*) FROM match_players WHERE match_id = m AND team = 'b') <> 5 THEN
    RAISE EXCEPTION 'both teams must finish with five players';
  END IF;
  IF (SELECT status FROM matches WHERE id = m) <> 'room' THEN RAISE EXCEPTION 'a full draft must open the room'; END IF;

  -- ---------- TEST C: Elo with K = 32 on averages 740 against 460 ----------
  UPDATE match_players SET rating_before = 740 WHERE match_id = m AND team = 'a';
  UPDATE match_players SET rating_before = 460 WHERE match_id = m AND team = 'b';
  -- The favorite wins: both sides move by only about 5.32.
  PERFORM pg_temp.finalize_match_gk(m, 5, 3);
  IF (SELECT round(elo_delta, 2) FROM rating_history WHERE match_id = m AND user_id = (SELECT captain_a FROM matches WHERE id = m)) <> 5.32 THEN
    RAISE EXCEPTION 'a favorite victory must pay about 5.34, got %',
      (SELECT elo_delta FROM rating_history WHERE match_id = m AND user_id = (SELECT captain_a FROM matches WHERE id = m));
  END IF;
  IF (SELECT round(elo_delta, 2) FROM rating_history WHERE match_id = m AND user_id = (SELECT captain_b FROM matches WHERE id = m)) <> -5.32 THEN
    RAISE EXCEPTION 'a beaten underdog must lose only about 5.34, got %',
      (SELECT elo_delta FROM rating_history WHERE match_id = m AND user_id = (SELECT captain_b FROM matches WHERE id = m));
  END IF;
  -- The same card with the favorite beaten: the big swing of about 26.66.
  m2 := gen_random_uuid();
  INSERT INTO matches(id, mode, region, status) VALUES(m2, 5, 'SA', 'room');
  INSERT INTO match_players(match_id, user_id, team, rating_before)
    SELECT m2, user_id, team, rating_before FROM match_players WHERE match_id = m;
  UPDATE matches SET captain_a = (SELECT captain_a FROM matches WHERE id = m),
                     captain_b = (SELECT captain_b FROM matches WHERE id = m) WHERE id = m2;
  PERFORM pg_temp.finalize_match_gk(m2, 3, 5);
  IF (SELECT round(elo_delta, 2) FROM rating_history WHERE match_id = m2 AND user_id = (SELECT captain_a FROM matches WHERE id = m2)) <> -26.68 THEN
    RAISE EXCEPTION 'a favorite defeat must pay about -26.66, got %',
      (SELECT elo_delta FROM rating_history WHERE match_id = m2 AND user_id = (SELECT captain_a FROM matches WHERE id = m2));
  END IF;
  IF (SELECT round(elo_delta, 2) FROM rating_history WHERE match_id = m2 AND user_id = (SELECT captain_b FROM matches WHERE id = m2)) <> 26.68 THEN
    RAISE EXCEPTION 'an underdog victory must pay about 26.66, got %',
      (SELECT elo_delta FROM rating_history WHERE match_id = m2 AND user_id = (SELECT captain_b FROM matches WHERE id = m2));
  END IF;

  -- ---------- TEST D + E: the win-streak table, and a defeat that resets it ----------
  -- Ten players all at 1000 MMR: every win is worth 16 Elo, so the rest is the streak bonus.
  DELETE FROM profiles; DELETE FROM matches; DELETE FROM match_players; DELETE FROM queue;
  DELETE FROM rating_history; DELETE FROM rank_history; DELETE FROM point_protection_wallets;
  DELETE FROM point_protection_events;
  ids := NULL;
  FOR i IN 1..10 LOOP
    ids := array_append(ids, gen_random_uuid());
    INSERT INTO profiles(id, name, rating) VALUES(ids[i], 'Streak test '||i, 1000);
  END LOOP;
  FOR round IN 1..10 LOOP
    m := gen_random_uuid();
    INSERT INTO matches(id, mode, region, status) VALUES(m, 5, 'SA', 'room');
    FOR i IN 1..10 LOOP
      INSERT INTO match_players(match_id, user_id, team, rating_before) VALUES(m, ids[i], CASE WHEN i <= 5 THEN 'a' ELSE 'b' END, 1000);
    END LOOP;
    before := (SELECT rating FROM profiles WHERE id = ids[1]);
    streak := (SELECT win_streak FROM profiles WHERE id = ids[1]);
    PERFORM pg_temp.finalize_match_gk(m, 5, 3);
    after := (SELECT rating FROM profiles WHERE id = ids[1]);
    earned := after - before;
    expected := 5 * streak;
    IF earned <> 16 + expected THEN
      RAISE EXCEPTION 'win % must pay the +5-per-win bonus, earned %', round, earned;
    END IF;
    IF (SELECT streak_bonus FROM rating_history WHERE match_id = m AND user_id = ids[1]) <> expected THEN
      RAISE EXCEPTION 'the bonus must be recorded apart from the Elo part';
    END IF;
  END LOOP;
  IF (SELECT win_streak FROM profiles WHERE id = ids[1]) <> 10 THEN RAISE EXCEPTION 'ten wins must leave a run of ten'; END IF;
  IF (SELECT best_win_streak FROM profiles WHERE id = ids[1]) <> 10 THEN RAISE EXCEPTION 'the best run must be kept'; END IF;
  IF NOT EXISTS (SELECT 1 FROM rank_history WHERE user_id = ids[1] AND kind = 'promotion') THEN
    RAISE EXCEPTION 'a rank rise must be logged in the history';
  END IF;
  -- A defeat wipes the run at once.
  m := gen_random_uuid();
  INSERT INTO matches(id, mode, region, status) VALUES(m, 5, 'SA', 'room');
  FOR i IN 1..10 LOOP
    INSERT INTO match_players(match_id, user_id, team, rating_before) VALUES(m, ids[i], CASE WHEN i <= 5 THEN 'a' ELSE 'b' END, 1000);
  END LOOP;
  PERFORM pg_temp.finalize_match_gk(m, 0, 1);
  IF (SELECT win_streak FROM profiles WHERE id = ids[1]) <> 0 THEN RAISE EXCEPTION 'a defeat must zero the streak'; END IF;
  IF (SELECT best_win_streak FROM profiles WHERE id = ids[1]) <> 10 THEN RAISE EXCEPTION 'a defeat must keep the best run'; END IF;
  IF (SELECT streak_bonus FROM rating_history WHERE match_id = m AND user_id = ids[1]) <> 0 THEN RAISE EXCEPTION 'losers get no streak bonus'; END IF;

  -- ---------- TEST G: admin controls over the winning-run bonus ----------
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'an admin account is needed for the authorization check'; END IF;
  INSERT INTO user_roles(user_id, role) VALUES(admin_id, 'admin');
  failed := false;
  PERFORM set_config('request.jwt.claim.sub', ids[1]::text, true);
  BEGIN PERFORM pg_temp.set_win_streak_settings(false, 1280, 10); EXCEPTION WHEN OTHERS THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'ordinary players may not change the bonus rules'; END IF;
  IF (SELECT enabled FROM win_streak_settings WHERE id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'a rejected change must not touch the rules'; END IF;

  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  IF (pg_temp.get_win_streak_settings() ->> 'maxBonus')::integer <> 1280 THEN RAISE EXCEPTION 'the rules must read back as saved'; END IF;
  -- Turn the bonus off: a win pays only the Elo part.
  PERFORM pg_temp.set_win_streak_settings(false, 1280, 10);
  m3 := gen_random_uuid();
  INSERT INTO matches(id, mode, region, status) VALUES(m3, 5, 'SA', 'room');
  FOR i IN 1..10 LOOP INSERT INTO match_players(match_id, user_id, team, rating_before) VALUES(m3, ids[i], CASE WHEN i <= 5 THEN 'a' ELSE 'b' END, 1000); END LOOP;
  UPDATE profiles SET win_streak = 2 WHERE id = ids[1];
  before := (SELECT rating FROM profiles WHERE id = ids[1]);
  PERFORM pg_temp.finalize_match_gk(m3, 5, 3);
  IF (SELECT rating FROM profiles WHERE id = ids[1]) - before <> 16 THEN
    RAISE EXCEPTION 'a disabled bonus must pay only the Elo part, got %', (SELECT rating FROM profiles WHERE id = ids[1]) - before;
  END IF;
  -- Cap it at 10: the 5th win would otherwise pay +40.
  PERFORM pg_temp.set_win_streak_settings(true, 10, 10);
  UPDATE profiles SET win_streak = 4 WHERE id = ids[1];
  m4 := gen_random_uuid();
  INSERT INTO matches(id, mode, region, status) VALUES(m4, 5, 'SA', 'room');
  FOR i IN 1..10 LOOP INSERT INTO match_players(match_id, user_id, team, rating_before) VALUES(m4, ids[i], CASE WHEN i <= 5 THEN 'a' ELSE 'b' END, 1000); END LOOP;
  before := (SELECT rating FROM profiles WHERE id = ids[1]);
  PERFORM pg_temp.finalize_match_gk(m4, 5, 3);
  IF (SELECT rating FROM profiles WHERE id = ids[1]) - before <> 26 THEN
    RAISE EXCEPTION 'the ceiling must cap the bonus at 10, got %', (SELECT rating FROM profiles WHERE id = ids[1]) - before;
  END IF;
  IF (SELECT streak_bonus FROM rating_history WHERE match_id = m4 AND user_id = ids[1]) <> 10 THEN RAISE EXCEPTION 'the recorded bonus must equal the capped value'; END IF;

  failed := false; BEGIN PERFORM pg_temp.set_win_streak_settings(true, -5, 10); EXCEPTION WHEN OTHERS THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'a negative bonus ceiling must be rejected'; END IF;
  failed := false; BEGIN PERFORM pg_temp.set_win_streak_settings(true, 100, 0); EXCEPTION WHEN OTHERS THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'a zero-length rewarded streak must be rejected'; END IF;
  IF NOT EXISTS (SELECT 1 FROM mod_actions WHERE action = 'ajustar_bonus_vitorias') THEN RAISE EXCEPTION 'changing the bonus rules must be logged'; END IF;

  -- ---------- TEST H: MMR never drops below zero ----------
  -- A player at 10 MMR on the losing side must land on 0, never negative.
  UPDATE profiles SET rating = 10, win_streak = 0 WHERE id = ids[1];
  m := gen_random_uuid();
  INSERT INTO matches(id, mode, region, status) VALUES(m, 5, 'SA', 'room');
  FOR i IN 1..10 LOOP
    INSERT INTO match_players(match_id, user_id, team, rating_before) VALUES(m, ids[i], CASE WHEN i <= 5 THEN 'a' ELSE 'b' END, 1000);
  END LOOP;
  PERFORM pg_temp.finalize_match_gk(m, 0, 5);
  IF (SELECT rating FROM profiles WHERE id = ids[1]) <> 0 THEN
    RAISE EXCEPTION 'a loss at 10 MMR must stop at zero, got %', (SELECT rating FROM profiles WHERE id = ids[1]);
  END IF;
  IF (SELECT rating_after FROM rating_history WHERE match_id = m AND user_id = ids[1]) <> 0 THEN
    RAISE EXCEPTION 'the recorded rating after the loss must be zero';
  END IF;
  IF (SELECT rating_after FROM match_players WHERE match_id = m AND user_id = ids[1]) <> 0 THEN
    RAISE EXCEPTION 'the match card must show zero after the loss';
  END IF;

  RAISE NOTICE 'PROMPT MASTER database tests passed: ladder limits, captains by MMR, A-B-B-A-A-B-B-A draft, Elo K=32, win-streak table, defeat reset, admin bonus controls, MMR floor at zero.';
END $$;
ROLLBACK;
