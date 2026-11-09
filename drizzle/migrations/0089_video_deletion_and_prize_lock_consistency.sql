GRANT DELETE ON public.player_videos TO authenticated;
CREATE POLICY video_admin_delete ON public.player_videos FOR DELETE TO authenticated USING(public.has_role(auth.uid(),'admin') AND NOT active AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='player-videos' AND name=object_path));
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.mark_event_prize_paid(uuid,uuid,integer,text)'::regprocedure) INTO d;
 d:=replace(d,'SELECT * INTO e FROM public.prize_events WHERE id=p_event;','SELECT * INTO e FROM public.prize_events WHERE id=p_event FOR UPDATE;'); EXECUTE d;
END $$;