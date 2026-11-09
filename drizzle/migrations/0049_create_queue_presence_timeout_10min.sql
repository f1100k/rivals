CREATE OR REPLACE FUNCTION public.queue_heartbeat_gk()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    UPDATE public.queue SET last_seen = now() WHERE user_id = auth.uid();
  END IF;
  -- Remove real players who have been offline (no heartbeat) for 10 minutes; bots never heartbeat.
  DELETE FROM public.queue q
  USING public.profiles p
  WHERE p.id = q.user_id AND NOT p.is_ghost AND q.last_seen < now() - interval '10 minutes';
END $$;
REVOKE ALL ON FUNCTION public.queue_heartbeat_gk() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.queue_heartbeat_gk() TO authenticated;