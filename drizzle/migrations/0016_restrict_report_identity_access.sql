REVOKE ALL ON public.player_reports FROM anon,authenticated;
GRANT ALL ON public.player_reports TO service_role;