BEGIN;
CREATE TEMP TABLE user_roles (LIKE public.user_roles INCLUDING ALL);
CREATE TEMP TABLE shop_items (LIKE public.shop_items INCLUDING ALL);
CREATE TEMP TABLE shop_settings (LIKE public.shop_settings INCLUDING ALL);
CREATE TEMP TABLE prize_events (LIKE public.prize_events INCLUDING ALL);
CREATE TEMP TABLE prize_payouts (LIKE public.prize_payouts INCLUDING ALL);
CREATE TEMP TABLE profiles (LIKE public.profiles INCLUDING ALL);
CREATE TEMP TABLE mod_actions (LIKE public.mod_actions INCLUDING ALL);
DO $$ DECLARE n text; d text; t text; BEGIN
 FOREACH n IN ARRAY ARRAY['admin_save_shop_item','admin_set_shop_limit','admin_save_prize_event','mark_event_prize_paid'] LOOP
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=n;
  d:=replace(d,'FUNCTION public.'||n||'(','FUNCTION pg_temp.'||n||'(');
  d:=replace(d,'SET search_path TO ''public''','SET search_path TO pg_temp,public');
  FOREACH t IN ARRAY ARRAY['user_roles','shop_items','shop_settings','prize_events','prize_payouts','profiles','mod_actions'] LOOP d:=replace(d,'public.'||t,t); END LOOP;
  d:=replace(d,'public.has_role(auth.uid(),''admin'')','EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role=''admin'')');
  d:=replace(d,'auth.uid()','nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid'); EXECUTE d;
 END LOOP;
END $$;
DO $$ DECLARE a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); denied boolean; BEGIN
 INSERT INTO user_roles(user_id,role) VALUES(a,'admin'); INSERT INTO profiles(id,name) VALUES(u,'Prize recipient');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM pg_temp.admin_save_shop_item('coroa-fogo','Nome editado',321,true,5);
 IF NOT EXISTS(SELECT 1 FROM shop_items WHERE id='coroa-fogo' AND name='Nome editado' AND price=321 AND active AND sort=5) THEN RAISE EXCEPTION 'shop editing failed'; END IF;
 PERFORM pg_temp.admin_save_shop_item('coroa-fogo','Nome editado',321,false,5);
 IF EXISTS(SELECT 1 FROM shop_items WHERE id='coroa-fogo' AND active) THEN RAISE EXCEPTION 'shop hiding failed'; END IF;
 PERFORM pg_temp.admin_set_shop_limit(2);
 IF (SELECT display_limit FROM shop_settings WHERE id)<>2 THEN RAISE EXCEPTION 'shop limit failed'; END IF;
 PERFORM pg_temp.admin_save_prize_event(e,'Campeonato',125.50,65,35);
 PERFORM pg_temp.mark_event_prize_paid(e,u,1,'Teste isolado');
 IF NOT EXISTS(SELECT 1 FROM prize_payouts WHERE event_id=e AND event_name='Campeonato' AND amount=125.50 AND user_id=u) THEN RAISE EXCEPTION 'custom prize failed'; END IF;
 denied:=false; BEGIN PERFORM pg_temp.mark_event_prize_paid(e,u,1,'Duplicado'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'duplicate payment allowed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 denied:=false; BEGIN PERFORM pg_temp.admin_set_shop_limit(10); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'non-admin shop edit allowed'; END IF;
 denied:=false; BEGIN PERFORM pg_temp.admin_save_prize_event(e,'Forbidden',1,1,1); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'non-admin prize edit allowed'; END IF;
END $$;
ROLLBACK;