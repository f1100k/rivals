-- Transaction rollback leaves no audit entries or changes in real accounts.
BEGIN;
SELECT set_config('test.owner','75ecb680-4220-4411-b0b6-ea981f102c2f',true);
SELECT set_config('test.other',(SELECT user_id::text FROM public.user_roles WHERE role='admin' AND user_id<>'75ecb680-4220-4411-b0b6-ea981f102c2f' LIMIT 1),true);
INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(current_setting('test.owner')::uuid,'protecao_pessoal_teste_privacidade',current_setting('test.owner')::uuid,'Temporary privacy test rolled back');
SELECT set_config('request.jwt.claim.sub',current_setting('test.other'),true);
-- sandbox_exec cannot SET ROLE; execute the installed policy expressions with caller claims.
DO $$ DECLARE expr text; visible boolean; BEGIN
 SELECT qual INTO expr FROM pg_policies WHERE schemaname='public' AND tablename='loss_shield_owners' AND policyname='Owner reads own shield';
 IF expr IS NULL THEN RAISE EXCEPTION 'Missing owner settings policy'; END IF;
 expr := replace(expr,'auth.uid()', 'nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid');
 EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.loss_shield_owners WHERE '||expr||')' INTO visible;
 IF visible THEN RAISE EXCEPTION 'Other admin must not read owner settings'; END IF;
 SELECT qual INTO expr FROM pg_policies WHERE schemaname='public' AND tablename='mod_actions' AND policyname='Personal scoring ledger is owner-only' AND permissive='RESTRICTIVE';
 IF expr IS NULL THEN RAISE EXCEPTION 'Missing restrictive ledger policy'; END IF;
 expr := replace(expr,'auth.uid()', 'nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid');
 EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.mod_actions WHERE action=''protecao_pessoal_teste_privacidade'' AND ('||expr||'))' INTO visible;
 IF visible THEN RAISE EXCEPTION 'Other admin must not read private ledger via policy'; END IF;
 IF EXISTS(SELECT 1 FROM json_array_elements(public.get_admin_overview()->'actions') a WHERE a->>'action'='protecao_pessoal_teste_privacidade') THEN RAISE EXCEPTION 'Admin RPC must not leak private ledger'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.loss_shield_owners WHERE paired_losses) THEN RAISE EXCEPTION 'Owner must see own rule'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mod_actions WHERE action='protecao_pessoal_teste_privacidade') THEN RAISE EXCEPTION 'Owner must see own ledger'; END IF;
 IF NOT EXISTS(SELECT 1 FROM json_array_elements(public.get_admin_overview()->'actions') a WHERE a->>'action'='protecao_pessoal_teste_privacidade') THEN RAISE EXCEPTION 'Owner admin must see own audit'; END IF;
 RAISE NOTICE 'Owner-only privacy passed for settings, RLS ledger and admin RPC';
END $$;
ROLLBACK;