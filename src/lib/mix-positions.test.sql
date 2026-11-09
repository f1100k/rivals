-- Mix team split: whatever positions the first 10 bring, each side gets one Goleiro and the line positions
-- are spread evenly (never more than one extra of a position on one side). Session-local data only.
BEGIN;
CREATE TEMP TABLE matches (LIKE public.matches INCLUDING ALL);
CREATE TEMP TABLE match_players (LIKE public.match_players INCLUDING ALL);
DO $$ DECLARE d text; BEGIN
  SELECT pg_get_functiondef('public.mix_assign_teams_gk(uuid)'::regprocedure) INTO d;
  d := replace(d, 'FUNCTION public.mix_assign_teams_gk(', 'FUNCTION pg_temp.mix_assign_teams_gk(');
  d := replace(d, 'SET search_path TO ''public''', 'SET search_path TO pg_temp,public');
  d := replace(replace(d, 'public.matches', 'matches'), 'public.match_players', 'match_players');
  EXECUTE d;
END $$;
DO $$
DECLARE m uuid; i int; pos text; side text; diff int;
BEGIN
  FOR i IN 1..300 LOOP
    m := gen_random_uuid();
    INSERT INTO matches(id, mode, region, status, draft_pool) VALUES (m, 5, 'TESTE', 'draft', 8);
    INSERT INTO match_players(match_id, user_id, team, position, rating_before) VALUES
      (m, gen_random_uuid(), NULL, 'Goleiro', (random()*500)::int),
      (m, gen_random_uuid(), NULL, 'Goleiro', (random()*500)::int);
    -- 8 line players with any mix of positions (e.g. 6 Pivô + 2 Ala, no Fixo)
    INSERT INTO match_players(match_id, user_id, team, position, rating_before)
      SELECT m, gen_random_uuid(), NULL, (ARRAY['Pivô','Fixo','Ala'])[1 + floor(random()*3)::int], (random()*500)::int FROM generate_series(1, 8);
    -- captains (any position) are pre-placed on opposite sides, as matchmaking does
    UPDATE match_players SET team = 'a' WHERE match_id = m AND user_id = (SELECT user_id FROM match_players WHERE match_id = m ORDER BY random() LIMIT 1);
    UPDATE match_players SET team = 'b' WHERE match_id = m AND user_id = (SELECT user_id FROM match_players WHERE match_id = m AND team IS NULL ORDER BY random() LIMIT 1);
    PERFORM pg_temp.mix_assign_teams_gk(m);
    IF EXISTS (SELECT 1 FROM match_players WHERE match_id = m AND team IS NULL) THEN RAISE EXCEPTION 'player left without a team'; END IF;
    FOREACH side IN ARRAY ARRAY['a','b'] LOOP
      IF (SELECT count(*) FROM match_players WHERE match_id = m AND team = side) <> 5 THEN RAISE EXCEPTION 'side % does not have 5 players', side; END IF;
      IF (SELECT count(*) FROM match_players WHERE match_id = m AND team = side AND position = 'Goleiro') <> 1 THEN RAISE EXCEPTION 'side % must have exactly one Goleiro', side; END IF;
    END LOOP;
    FOREACH pos IN ARRAY ARRAY['Pivô','Fixo','Ala'] LOOP
      SELECT abs(count(*) FILTER (WHERE team = 'a') - count(*) FILTER (WHERE team = 'b')) INTO diff
        FROM match_players WHERE match_id = m AND position = pos;
      IF diff > 1 THEN RAISE EXCEPTION '% split unevenly (difference %)', pos, diff; END IF;
    END LOOP;
    IF (SELECT status FROM matches WHERE id = m) <> 'room' OR NOT (SELECT is_mix FROM matches WHERE id = m) THEN RAISE EXCEPTION 'mix match not opened'; END IF;
  END LOOP;
END $$;
ROLLBACK;
