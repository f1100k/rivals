CREATE FUNCTION public.admin_adjust_record(p_user uuid,p_wins_delta integer,p_losses_delta integer,p_reason text,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_w integer; v_l integer; v_nw integer; v_nl integer; v_previous text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_wins_delta IS NULL OR p_losses_delta IS NULL OR (p_wins_delta=0 AND p_losses_delta=0)
    OR abs(p_wins_delta::bigint)>10000 OR abs(p_losses_delta::bigint)>10000
    OR p_request IS NULL OR length(trim(coalesce(p_reason,'')))<3 OR length(p_reason)>500 THEN RAISE EXCEPTION 'invalid_adjustment'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin-record:'||p_request::text,0));
 SELECT reason INTO v_previous FROM public.mod_actions WHERE actor_id=auth.uid() AND action='adjust_record' AND reason LIKE p_request::text||' %' LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('repeated',true); END IF;
 PERFORM public.lock_competitive_player(p_user);
 SELECT wins,losses INTO v_w,v_l FROM public.profiles WHERE id=p_user AND NOT is_ghost FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_player'; END IF;
 v_nw:=greatest(0,v_w+p_wins_delta); v_nl:=greatest(0,v_l+p_losses_delta);
 UPDATE public.profiles SET wins=v_nw, losses=v_nl WHERE id=p_user;
 INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'adjust_record',p_user,
   p_request::text||' V '||v_w||' → '||v_nw||' · D '||v_l||' → '||v_nl||': '||trim(p_reason));
 RETURN jsonb_build_object('wins',v_nw,'losses',v_nl);
END $$;
REVOKE ALL ON FUNCTION public.admin_adjust_record(uuid,integer,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_record(uuid,integer,integer,text,uuid) TO authenticated;