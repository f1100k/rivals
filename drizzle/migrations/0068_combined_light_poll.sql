CREATE OR REPLACE FUNCTION public.queue_heartbeat_gk() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    -- Write only when the stamp is stale, avoiding a row write on every poll.
    UPDATE public.queue SET last_seen = now() WHERE user_id = auth.uid() AND last_seen < now() - interval '30 seconds';
  END IF;
  -- Only one poller at a time sweeps offline players; others skip instead of waiting.
  IF pg_try_advisory_xact_lock(52719, 77) THEN
    DELETE FROM public.queue q USING public.profiles p
    WHERE p.id = q.user_id AND NOT p.is_ghost AND q.last_seen < now() - interval '10 minutes';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.poll_inhouse_gk() RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_draft json; v_state json;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.queue_heartbeat_gk();
  v_draft := public.draft_tick_gk();
  v_state := public.get_inhouse_state_gk();
  RETURN json_build_object('state', v_state, 'draft', v_draft);
END $$;
REVOKE ALL ON FUNCTION public.poll_inhouse_gk() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poll_inhouse_gk() TO authenticated;