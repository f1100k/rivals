CREATE OR REPLACE FUNCTION public.admin_remove_video(p_video uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE path text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT object_path INTO path FROM public.player_videos WHERE id = p_video FOR UPDATE;
  IF path IS NULL THEN RETURN NULL; END IF;
  DELETE FROM public.player_videos WHERE id = p_video;
  INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'video_apagado', p_video::text || ': ' || path);
  RETURN path;
END $function$;