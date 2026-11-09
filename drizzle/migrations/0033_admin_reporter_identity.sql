CREATE OR REPLACE FUNCTION public.get_admin_player_reports()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x.latest DESC) FROM (SELECT s.target_id AS "targetId",p.name,s.strikes,s.cycle,
 CASE WHEN s.banned_until='infinity' THEN 'permanent' ELSE s.banned_until::text END AS "bannedUntil",
 (SELECT count(*) FROM public.player_reports WHERE target_id=s.target_id AND cycle=s.cycle AND NOT dismissed) AS pending,
 (SELECT max(created_at) FROM public.player_reports WHERE target_id=s.target_id) AS latest,
 (SELECT jsonb_agg(jsonb_build_object('id',r.id,'matchId',r.match_id,'cycle',r.cycle,'reason',r.reason,'dismissed',r.dismissed,'verdict',r.verdict,'createdAt',r.created_at,'reporterId',r.reporter_id,'reporterName',reporter.name) ORDER BY r.created_at DESC) FROM public.player_reports r LEFT JOIN public.profiles reporter ON reporter.id=r.reporter_id WHERE r.target_id=s.target_id) AS reports
 FROM public.player_report_state s JOIN public.profiles p ON p.id=s.target_id) x),'[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.get_admin_player_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_player_reports() TO authenticated;
COMMENT ON FUNCTION public.get_admin_player_reports() IS 'Admin-only report review with reporter identity; private report table remains inaccessible to players and moderators.';