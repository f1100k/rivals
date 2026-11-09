-- Session-local copies exercise grants without changing real player inventories.
BEGIN;
CREATE TEMP TABLE profiles (LIKE public.profiles INCLUDING ALL);
CREATE TEMP TABLE user_roles (LIKE public.user_roles INCLUDING ALL);
CREATE TEMP TABLE coin_wallets (LIKE public.coin_wallets INCLUDING ALL);
CREATE TEMP TABLE avatar_frame_access (LIKE public.avatar_frame_access INCLUDING ALL);
CREATE TEMP TABLE point_protection_wallets (LIKE public.point_protection_wallets INCLUDING ALL);
CREATE TEMP TABLE point_protection_events (LIKE public.point_protection_events INCLUDING ALL);
CREATE TEMP TABLE mod_actions (LIKE public.mod_actions INCLUDING ALL);
CREATE TEMP TABLE custom_avatar_frames (LIKE public.custom_avatar_frames INCLUDING ALL);
DO $$ DECLARE n text; d text; t text; BEGIN
 FOREACH n IN ARRAY ARRAY['lock_competitive_player','refresh_point_wallet','valid_avatar_frame','admin_grant_inventory'] LOOP
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=n;
 d:=replace(d,'FUNCTION public.'||n||'(','FUNCTION pg_temp.'||n||'(');
 d:=replace(d,'SET search_path TO ''public''','SET search_path TO pg_temp, public');
 FOREACH t IN ARRAY ARRAY['profiles','user_roles','coin_wallets','avatar_frame_access','point_protection_wallets','point_protection_events','mod_actions','custom_avatar_frames'] LOOP d:=replace(d,'public.'||t,t); END LOOP;
 d:=replace(d,'public.lock_competitive_player(','pg_temp.lock_competitive_player(');
 d:=replace(d,'public.refresh_point_wallet(','pg_temp.refresh_point_wallet(');
 d:=replace(d,'public.valid_avatar_frame(','pg_temp.valid_avatar_frame(');
 d:=replace(d,'public.has_role(auth.uid(), ''admin'')','EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role=''admin'')');
 d:=replace(d,'public.has_role(auth.uid(),''admin'')','EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role=''admin'')');
 d:=replace(d,'auth.uid()','nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid');
 EXECUTE d;
 END LOOP;
END $$;
DO $$ DECLARE a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); blocked boolean:=false; BEGIN
 INSERT INTO profiles(id,name) VALUES(u,'Inventory test');
 INSERT INTO user_roles(user_id,role) VALUES(a,'admin');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM pg_temp.admin_grant_inventory(u,'coins',50,null,'Teste moedas',r);
 IF (SELECT balance FROM coin_wallets WHERE user_id=u)<>50 THEN RAISE EXCEPTION 'coin grant failed'; END IF;
 PERFORM pg_temp.admin_grant_inventory(u,'coins',50,null,'Teste moedas',r);
 IF (SELECT balance FROM coin_wallets WHERE user_id=u)<>50 THEN RAISE EXCEPTION 'duplicate coin grant'; END IF;
 PERFORM pg_temp.admin_grant_inventory(u,'protection',5,null,'Teste proteção',gen_random_uuid());
 IF (SELECT rank_stock FROM point_protection_wallets WHERE user_id=u)<>5 THEN RAISE EXCEPTION 'protector grant failed'; END IF;
 PERFORM pg_temp.admin_grant_inventory(u,'frame',1,'neon-roxo','Teste moldura',gen_random_uuid());
 IF NOT EXISTS(SELECT 1 FROM avatar_frame_access WHERE user_id=u AND frame='neon-roxo') THEN RAISE EXCEPTION 'frame grant failed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 BEGIN PERFORM pg_temp.admin_grant_inventory(u,'coins',50,null,'Não autorizado',gen_random_uuid()); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'non-admin was allowed'; END IF;
END $$;
ROLLBACK;