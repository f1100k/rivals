CREATE TABLE public.discord_queue_interactions (interaction_id text PRIMARY KEY, result text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.discord_queue_interactions TO service_role;
ALTER TABLE public.discord_queue_interactions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.discord_queue_action(p_discord_id text, p_interaction_id text, p_action text, p_position text DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_result text; v_old_sub text; v_old_claims text;
BEGIN
 IF p_discord_id !~ '^[0-9]{17,20}$' OR p_interaction_id !~ '^[0-9]{17,20}$' THEN RAISE EXCEPTION 'invalid_discord_identity'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_interaction_id,0));
 SELECT result INTO v_result FROM public.discord_queue_interactions WHERE interaction_id=p_interaction_id;
 IF FOUND THEN RETURN v_result; END IF;
 SELECT user_id INTO v_user FROM public.discord_links WHERE discord_id=p_discord_id;
 IF v_user IS NULL THEN RAISE EXCEPTION 'discord_not_linked'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,1));
 v_old_sub:=current_setting('request.jwt.claim.sub',true); v_old_claims:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
 IF p_action='join' THEN
  PERFORM public.join_queue_gk(p_position); v_result:='joined';
 ELSIF p_action='leave' THEN
  PERFORM public.leave_queue_gk(); v_result:='left';
 ELSIF p_action='heartbeat' THEN
  PERFORM public.queue_heartbeat_gk();
  IF EXISTS(SELECT 1 FROM public.queue WHERE user_id=v_user) THEN v_result:='present'; ELSE v_result:='not_queued'; END IF;
 ELSE RAISE EXCEPTION 'invalid_queue_action'; END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(v_old_sub,''),true);
 PERFORM set_config('request.jwt.claims',coalesce(v_old_claims,'{}'),true);
 INSERT INTO public.discord_queue_interactions(interaction_id,result) VALUES(p_interaction_id,v_result);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.discord_queue_action(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.discord_queue_action(text,text,text,text) TO service_role;