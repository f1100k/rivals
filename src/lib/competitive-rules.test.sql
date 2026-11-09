-- Isolated shadow tables: no real users, ratings, matches, or reports are changed.
BEGIN;
CREATE TEMP TABLE profiles (LIKE public.profiles INCLUDING ALL);
CREATE TEMP TABLE matches (LIKE public.matches INCLUDING ALL);
CREATE TEMP TABLE match_players (LIKE public.match_players INCLUDING ALL);
CREATE TEMP TABLE queue (LIKE public.queue INCLUDING ALL);
CREATE TEMP TABLE point_protection_wallets (LIKE public.point_protection_wallets INCLUDING ALL);
CREATE TEMP TABLE point_protection_events (LIKE public.point_protection_events INCLUDING ALL);
CREATE TEMP TABLE player_reports (LIKE public.player_reports INCLUDING ALL);
CREATE TEMP TABLE player_report_state (LIKE public.player_report_state INCLUDING ALL);
CREATE TEMP TABLE mod_actions (LIKE public.mod_actions INCLUDING ALL);
CREATE TEMP TABLE user_roles (LIKE public.user_roles INCLUDING ALL);
CREATE TEMP TABLE win_streak_settings (LIKE public.win_streak_settings INCLUDING ALL);
CREATE TEMP TABLE rating_history (LIKE public.rating_history INCLUDING ALL);
CREATE TEMP TABLE rank_history (LIKE public.rank_history INCLUDING ALL);
CREATE TEMP TABLE loss_shield_owners (LIKE public.loss_shield_owners INCLUDING ALL);
-- Production streak settings copied so the expected Elo numbers stay identical.
INSERT INTO win_streak_settings(id,enabled,max_bonus,max_rewarded_streak)
  SELECT id,enabled,max_bonus,max_rewarded_streak FROM public.win_streak_settings LIMIT 1;
-- Clone production function bodies into session-local functions. The production
-- finalizer is deliberately not executable by the test connection's role.
DO $$
DECLARE name text; definition text; helper text; tbl text;
BEGIN
 FOREACH name IN ARRAY ARRAY['refresh_point_wallet','finalize_match_gk','get_point_protection_state','activate_point_protection','submit_player_report','review_player_report','lock_competitive_player'] LOOP
  SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=name;
  definition:=replace(definition,'FUNCTION public.'||name||'(', 'FUNCTION pg_temp.'||name||'(');
  definition:=replace(definition,'SET search_path TO ''public''','SET search_path TO pg_temp, public');
  definition:=replace(definition,'public.lock_competitive_player(','pg_temp.lock_competitive_player(');
  FOREACH tbl IN ARRAY ARRAY['profiles','matches','match_players','queue','point_protection_wallets','point_protection_events','player_reports','player_report_state','mod_actions','user_roles','win_streak_settings','rating_history','rank_history','loss_shield_owners'] LOOP
   definition:=replace(definition,'public.'||tbl,tbl);
  END LOOP;
  definition:=replace(definition,'auth.uid()', 'nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid');
  definition:=replace(definition,'public.has_role(auth.uid(),''admin'')','EXISTS(SELECT 1 FROM user_roles WHERE user_id=nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid AND role=''admin'')');
  definition:=replace(definition,'public.has_role(nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid,''admin'')','EXISTS(SELECT 1 FROM user_roles WHERE user_id=nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid AND role=''admin'')');
  FOREACH helper IN ARRAY ARRAY['refresh_point_wallet','get_point_protection_state'] LOOP
   definition:=regexp_replace(definition,'\m'||helper||'\(', 'pg_temp.'||helper||'(', 'g');
   definition:=replace(definition,'pg_temp.pg_temp.','pg_temp.');
  END LOOP;
  EXECUTE definition;
 END LOOP;
END $$;
DO $$
DECLARE ids uuid[]; m uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid(); admin_id uuid; i integer; report_id uuid; state jsonb; failed boolean;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
 IF admin_id IS NULL THEN RAISE EXCEPTION 'Admin needed for authorization check'; END IF;
 FOR i IN 1..10 LOOP
  ids:=array_append(ids,gen_random_uuid());
  INSERT INTO profiles(id,name,rating) VALUES(ids[i],'Competitive test '||i,CASE WHEN i<=5 THEN 3500 ELSE 2000 END);
 END LOOP;
 INSERT INTO user_roles(user_id,role) VALUES(admin_id,'admin');
 INSERT INTO matches(id,mode,region,status,created_at) VALUES(m,5,'SA','room',now()-interval '1 hour');
 FOR i IN 1..10 LOOP INSERT INTO match_players(match_id,user_id,team,rating_before) VALUES(m,ids[i],CASE WHEN i<=5 THEN 'a' ELSE 'b' END,CASE WHEN i<=5 THEN 3500 ELSE 2000 END); END LOOP;
 PERFORM pg_temp.finalize_match_gk(m,0,1);
 -- Elo K=32 on the five-player averages: at a 1500 MMR gap the expected score is ~1, so the
 -- favorite's defeat costs the full K and the underdog's win gains the full K.
 IF (SELECT rating FROM profiles WHERE id=ids[1])<>3468 THEN RAISE EXCEPTION 'favorite defeat at a 1500 MMR gap must cost the full K=32'; END IF;
 IF (SELECT rating FROM profiles WHERE id=ids[6])<>2032 THEN RAISE EXCEPTION 'underdog win at a 1500 MMR gap must gain the full K=32'; END IF;
 IF (SELECT average_a FROM matches WHERE id=m)<>3500 OR (SELECT average_b FROM matches WHERE id=m)<>2000 THEN RAISE EXCEPTION 'team means incorrect'; END IF;
 failed:=false; BEGIN PERFORM pg_temp.finalize_match_gk(m,0,1); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'duplicate finalization accepted'; END IF;
 PERFORM set_config('request.jwt.claim.sub',ids[1]::text,true);
 PERFORM pg_temp.activate_point_protection(m,'daily');
 IF (SELECT rating FROM profiles WHERE id=ids[1])<>3500 THEN RAISE EXCEPTION 'protection failed to restore original rating'; END IF;
 IF (SELECT daily_available FROM point_protection_wallets WHERE user_id=ids[1]) THEN RAISE EXCEPTION 'daily activator not consumed'; END IF;
 failed:=false; BEGIN PERFORM pg_temp.activate_point_protection(m,'daily'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'duplicate protection accepted'; END IF;
 UPDATE point_protection_wallets SET daily_next_at=now()-interval '5 days' WHERE user_id=ids[2];
 PERFORM pg_temp.refresh_point_wallet(ids[2]);
 IF NOT (SELECT daily_available FROM point_protection_wallets WHERE user_id=ids[2]) THEN RAISE EXCEPTION 'daily refill failed'; END IF;
 IF (SELECT rank_stock FROM point_protection_wallets WHERE user_id=ids[2])<>0 THEN RAISE EXCEPTION 'daily refill affected rank stock'; END IF;
 PERFORM set_config('request.jwt.claim.sub',ids[3]::text,true);
 UPDATE point_protection_wallets SET rank_stock=2 WHERE user_id=ids[3];
 PERFORM pg_temp.activate_point_protection(m,'rank');
 IF (SELECT rank_stock FROM point_protection_wallets WHERE user_id=ids[3])<>1 OR NOT (SELECT daily_available FROM point_protection_wallets WHERE user_id=ids[3]) THEN RAISE EXCEPTION 'rank protection must consume exactly one independent activator'; END IF;
 IF (SELECT rating FROM profiles WHERE id=ids[3])<>3500 THEN RAISE EXCEPTION 'rank protection failed to restore points'; END IF;
 FOR i IN 2..8 LOOP
  PERFORM set_config('request.jwt.claim.sub',ids[i]::text,true);
  PERFORM pg_temp.submit_player_report(m,ids[1],'Sabotagem intencional observada: entregou a bola repetidamente ao adversário.');
 END LOOP;
 IF (SELECT banned_until FROM player_report_state WHERE target_id=ids[1]) IS NOT NULL THEN RAISE EXCEPTION 'submitted reports must not automatically ban'; END IF;
 PERFORM set_config('request.jwt.claim.sub',ids[1]::text,true);
 state:=pg_temp.get_point_protection_state();
 IF state->'result'->>'blockedReason' IS NULL THEN RAISE EXCEPTION 'pending reports must block protection'; END IF;
 PERFORM set_config('request.jwt.claim.sub',ids[2]::text,true);
 failed:=false; BEGIN PERFORM pg_temp.review_player_report(ids[1],gen_random_uuid(),'uphold','Infração confirmada.'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'ordinary user may not review'; END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 FOR report_id IN SELECT id FROM player_reports WHERE target_id=ids[1] LOOP PERFORM pg_temp.review_player_report(ids[1],report_id,'uphold','Sabotagem intencional confirmada pelas evidências.'); END LOOP;
 -- Protection restored 3500; confirmed trolling revokes it (back to 3468) and adds the flat -9.
 IF (SELECT rating FROM profiles WHERE id=ids[1])<>3459 THEN RAISE EXCEPTION 'confirmed trolling must revoke protection and add the flat -9 penalty'; END IF;
 IF NOT (SELECT daily_available FROM point_protection_wallets WHERE user_id=ids[1]) THEN RAISE EXCEPTION 'revoked protection must refund activator'; END IF;
 IF (SELECT strikes FROM player_report_state WHERE target_id=ids[1])<>1 THEN RAISE EXCEPTION 'one confirmed cycle must trigger exactly one sanction'; END IF;
 IF (SELECT banned_until FROM player_report_state WHERE target_id=ids[1]) IS DISTINCT FROM now()+interval '1 hour' THEN RAISE EXCEPTION 'first ban must be one hour'; END IF;
 -- First named-tier award: an underdog victory lifts a 290 MMR player past the 300 boundary.
 UPDATE profiles SET rating=290 WHERE id=ids[2];
 UPDATE point_protection_wallets SET highest_tier=0,rank_stock=0 WHERE user_id=ids[2];
 INSERT INTO matches(id,mode,region,status) VALUES(m2,5,'SA','room');
 FOR i IN 1..10 LOOP INSERT INTO match_players(match_id,user_id,team,rating_before) VALUES(m2,ids[i],CASE WHEN i IN (1,3,4,5,7) THEN 'a' ELSE 'b' END,CASE WHEN i<=5 THEN 3500 ELSE 2000 END); END LOOP;
 PERFORM set_config('request.jwt.claim.sub',ids[4]::text,true);
 failed:=false; BEGIN PERFORM pg_temp.activate_point_protection(m,'daily'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'protection must expire once another match starts'; END IF;
 PERFORM pg_temp.finalize_match_gk(m2,0,1);
 -- Team b (average 2300) beats team a (average 3200): the full K=32, no run bonus on a first win.
 IF (SELECT rating FROM profiles WHERE id=ids[2])<>322 THEN RAISE EXCEPTION 'underdog victory must grant the full K=32'; END IF;
 IF (SELECT rank_stock FROM point_protection_wallets WHERE user_id=ids[2])<>1 THEN RAISE EXCEPTION 'named rank promotion must grant one activator'; END IF;
 PERFORM set_config('request.jwt.claim.sub',ids[2]::text,true);
 failed:=false; BEGIN PERFORM pg_temp.activate_point_protection(m2,'daily'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'winners cannot use loss protection'; END IF;
 RAISE NOTICE 'Competitive database tests passed: scoring, means, duplicates, protection, refill, pending reports, roles, sanctions, reversal, promotions.';
END $$;
ROLLBACK;