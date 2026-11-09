CREATE FUNCTION public.admin_adjust_rating(p_user uuid,p_delta integer,p_reason text,p_request uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_before integer; v_after integer; v_previous text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_delta IS NULL OR p_delta=0 OR abs(p_delta::bigint)>100000 OR p_request IS NULL OR length(trim(coalesce(p_reason,'')))<3 OR length(p_reason)>500 THEN RAISE EXCEPTION 'invalid_adjustment'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin-adjust:'||p_request::text,0));
 SELECT reason INTO v_previous FROM public.mod_actions WHERE actor_id=auth.uid() AND action='adjust_rating' AND reason LIKE p_request::text||' %' LIMIT 1;
 IF FOUND THEN RETURN (split_part(v_previous,' ',5))::integer; END IF;
 PERFORM public.lock_competitive_player(p_user);
 SELECT rating INTO v_before FROM public.profiles WHERE id=p_user AND NOT is_ghost FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_player'; END IF;
 v_after:=greatest(0,v_before+p_delta);
 UPDATE public.profiles SET rating=v_after WHERE id=p_user;
 INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'adjust_rating',p_user,p_request::text||' MMR '||v_before||' → '||v_after||' ('||(v_after-v_before)||'): '||trim(p_reason));
 RETURN v_after;
END $$;
REVOKE ALL ON FUNCTION public.admin_adjust_rating(uuid,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_rating(uuid,integer,text,uuid) TO authenticated;