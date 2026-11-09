CREATE POLICY "Personal scoring ledger is owner-only" ON public.mod_actions AS RESTRICTIVE FOR SELECT TO authenticated USING (action NOT LIKE 'protecao_pessoal%' OR target_user = auth.uid());
DO $migration$
DECLARE definition text;
BEGIN
SELECT pg_get_functiondef('public.get_admin_overview()'::regprocedure) INTO definition;
IF position('FROM mod_actions a ORDER BY' IN definition)=0 THEN RAISE EXCEPTION 'Visão administrativa divergente'; END IF;
definition := replace(definition,'FROM mod_actions a ORDER BY','FROM mod_actions a WHERE (a.action NOT LIKE ''protecao_pessoal%'' OR a.target_user = auth.uid()) ORDER BY');
EXECUTE definition;
END $migration$;