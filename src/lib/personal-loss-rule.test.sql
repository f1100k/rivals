-- Production function bodies exercised against temporary shadow tables only.
BEGIN;
CREATE TEMP TABLE profiles (LIKE public.profiles INCLUDING ALL);
CREATE TEMP TABLE matches (LIKE public.matches INCLUDING ALL);
CREATE TEMP TABLE match_players (LIKE public.match_players INCLUDING ALL);
CREATE TEMP TABLE point_protection_wallets (LIKE public.point_protection_wallets INCLUDING ALL);
CREATE TEMP TABLE point_protection_events (LIKE public.point_protection_events INCLUDING ALL);
CREATE TEMP TABLE win_streak_settings (LIKE public.win_streak_settings INCLUDING ALL);
CREATE TEMP TABLE rating_history (LIKE public.rating_history INCLUDING ALL);
CREATE TEMP TABLE rank_history (LIKE public.rank_history INCLUDING ALL);
CREATE TEMP TABLE mod_actions (LIKE public.mod_actions INCLUDING ALL);
CREATE TEMP TABLE loss_shield_owners (LIKE public.loss_shield_owners INCLUDING ALL);
INSERT INTO win_streak_settings(id,enabled) VALUES(true,false);
DO $$
DECLARE fn text; definition text; tbl text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['refresh_point_wallet','finalize_match_gk','lock_competitive_player'] LOOP
    SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=fn;
    definition := replace(definition,'FUNCTION public.'||fn||'(', 'FUNCTION pg_temp.'||fn||'(');
    definition := replace(definition,'SET search_path TO ''public''','SET search_path TO pg_temp, public');
    definition := replace(definition,'public.lock_competitive_player(', 'pg_temp.lock_competitive_player(');
    FOREACH tbl IN ARRAY ARRAY['profiles','matches','match_players','point_protection_wallets','point_protection_events','win_streak_settings','rating_history','rank_history','mod_actions','loss_shield_owners'] LOOP
      definition := replace(definition,'public.'||tbl,tbl);
    END LOOP;
    definition := replace(definition,'refresh_point_wallet(', 'pg_temp.refresh_point_wallet(');
    definition := replace(definition,'public.pg_temp.', 'pg_temp.');
    definition := replace(definition,'pg_temp.pg_temp.', 'pg_temp.');
    EXECUTE definition;
  END LOOP;
END $$;
DO $$
DECLARE ids uuid[]; m uuid; i integer; round integer; expected integer; before integer; failed boolean;
BEGIN
  FOR i IN 1..10 LOOP
    ids := array_append(ids,gen_random_uuid());
    INSERT INTO profiles(id,name,rating) VALUES(ids[i],'Isolated paired loss '||i,1000);
  END LOOP;
  INSERT INTO loss_shield_owners(user_id) VALUES(ids[1]);
  -- L,L,L,W,L,L,L,L: the win interrupts the pending loss; charged pairs restart.
  FOR round IN 1..8 LOOP
    m := gen_random_uuid();
    INSERT INTO matches(id,mode,region,status) VALUES(m,5,'SA','room');
    FOR i IN 1..10 LOOP
      INSERT INTO match_players(match_id,user_id,team,rating_before) VALUES(m,ids[i],CASE WHEN i<=5 THEN 'a' ELSE 'b' END,1000);
    END LOOP;
    before := (SELECT rating FROM profiles WHERE id=ids[1]);
    PERFORM pg_temp.finalize_match_gk(m,CASE WHEN round=4 THEN 5 ELSE 0 END,CASE WHEN round=4 THEN 0 ELSE 5 END);
    expected := CASE WHEN round=4 THEN 16 WHEN round IN (2,6,8) THEN -17 ELSE 0 END;
    IF (SELECT rating FROM profiles WHERE id=ids[1])-before <> expected THEN RAISE EXCEPTION 'Round % must apply %, got %',round,expected,(SELECT rating FROM profiles WHERE id=ids[1])-before; END IF;
    IF (SELECT delta FROM match_players WHERE match_id=m AND user_id=ids[1]) <> expected THEN RAISE EXCEPTION 'Match delta must be truthful'; END IF;
    IF (SELECT total_delta FROM rating_history WHERE match_id=m AND user_id=ids[1]) <> expected THEN RAISE EXCEPTION 'Rating ledger must match'; END IF;
    IF (SELECT delta FROM match_players WHERE match_id=m AND user_id=ids[2]) <> (CASE WHEN round=4 THEN 16 ELSE -16 END) THEN RAISE EXCEPTION 'Non-owner must retain normal Elo'; END IF;
    failed:=false;
    BEGIN PERFORM pg_temp.finalize_match_gk(m,0,5); EXCEPTION WHEN OTHERS THEN failed:=true; END;
    IF NOT failed THEN RAISE EXCEPTION 'Duplicate finalization must fail'; END IF;
  END LOOP;
  IF (SELECT losses FROM profiles WHERE id=ids[1])<>7 OR (SELECT wins FROM profiles WHERE id=ids[1])<>1 THEN RAISE EXCEPTION 'All real results must remain in statistics'; END IF;
  IF (SELECT count(*) FROM mod_actions WHERE target_user=ids[1])<>8 THEN RAISE EXCEPTION 'Every exception and win reset must be auditable'; END IF;
  -- Bot games never advance the pair or count as losses.
  UPDATE profiles SET is_ghost=true WHERE id=ids[10];
  m:=gen_random_uuid(); INSERT INTO matches(id,mode,region,status) VALUES(m,5,'SA','room');
  FOR i IN 1..10 LOOP INSERT INTO match_players(match_id,user_id,team,rating_before) VALUES(m,ids[i],CASE WHEN i<=5 THEN 'a' ELSE 'b' END,1000); END LOOP;
  PERFORM pg_temp.finalize_match_gk(m,0,5);
  IF (SELECT pending_loss FROM loss_shield_owners WHERE user_id=ids[1]) OR (SELECT losses FROM profiles WHERE id=ids[1])<>7 THEN RAISE EXCEPTION 'Bot matches must not count'; END IF;
  UPDATE profiles SET is_ghost=false WHERE id=ids[10];
  -- The second loss respects the existing zero floor.
  UPDATE profiles SET rating=10 WHERE id=ids[1];
  UPDATE loss_shield_owners SET pending_loss=true WHERE user_id=ids[1];
  m:=gen_random_uuid(); INSERT INTO matches(id,mode,region,status) VALUES(m,5,'SA','room');
  FOR i IN 1..10 LOOP INSERT INTO match_players(match_id,user_id,team,rating_before) VALUES(m,ids[i],CASE WHEN i<=5 THEN 'a' ELSE 'b' END,1000); END LOOP;
  PERFORM pg_temp.finalize_match_gk(m,0,5);
  IF (SELECT rating FROM profiles WHERE id=ids[1])<>0 THEN RAISE EXCEPTION '17 MMR loss at 10 must stop at zero'; END IF;
  RAISE NOTICE 'Personal loss rules passed: exclusive owner, pairs, win reset, truthful defeats, audit, bots, idempotency and zero floor';
END $$;
ROLLBACK;