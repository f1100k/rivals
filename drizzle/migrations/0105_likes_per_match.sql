ALTER TABLE public.player_likes DROP CONSTRAINT player_likes_pkey;
ALTER TABLE public.player_likes ADD CONSTRAINT player_likes_pkey PRIMARY KEY (giver_id, target_id, match_id);
CREATE INDEX IF NOT EXISTS player_likes_target_idx ON public.player_likes(target_id);

CREATE OR REPLACE FUNCTION public.like_player(p_match uuid, p_target uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_me uuid := auth.uid(); v_my_team text; v_their_team text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'nao_autenticado'; END IF;
  IF v_me = p_target THEN RAISE EXCEPTION 'Você não pode curtir a si mesmo.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match AND status IN ('room','voting','reporting','disputed','completed')) THEN
    RAISE EXCEPTION 'As curtidas abrem quando os times estiverem formados.'; END IF;
  SELECT team INTO v_my_team FROM match_players WHERE match_id = p_match AND user_id = v_me;
  SELECT mp.team INTO v_their_team FROM match_players mp JOIN profiles p ON p.id = mp.user_id
    WHERE mp.match_id = p_match AND mp.user_id = p_target AND NOT p.is_ghost;
  IF v_my_team IS NULL OR v_their_team IS NULL OR lower(v_my_team) <> lower(v_their_team) THEN
    RAISE EXCEPTION 'Só é possível curtir companheiros do seu time.'; END IF;
  INSERT INTO player_likes(giver_id, target_id, match_id) VALUES (v_me, p_target, p_match)
    ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $function$;

CREATE OR REPLACE FUNCTION public.get_my_match_liked_ids(p_match uuid)
 RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(array_agg(target_id), '{}') FROM public.player_likes
  WHERE giver_id = auth.uid() AND match_id = p_match
$function$;
REVOKE EXECUTE ON FUNCTION public.get_my_match_liked_ids(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_match_liked_ids(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_like_matches()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'completedAt' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', m.id, 'completedAt', m.completed_at, 'players',
      (SELECT coalesce(jsonb_agg(jsonb_build_object('userId', p.id, 'name', p.name,
         'liked', EXISTS (SELECT 1 FROM player_likes l WHERE l.giver_id = auth.uid() AND l.target_id = p.id AND l.match_id = m.id)) ORDER BY p.name), '[]'::jsonb)
       FROM match_players o JOIN profiles p ON p.id = o.user_id
       WHERE o.match_id = m.id AND o.user_id <> auth.uid() AND lower(o.team) = lower(me.team) AND NOT p.is_ghost)) AS x
    FROM match_players me JOIN matches m ON m.id = me.match_id
    WHERE me.user_id = auth.uid() AND m.status = 'completed' AND me.team IS NOT NULL
    ORDER BY m.completed_at DESC LIMIT 10
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.player_like_supporters(p_user uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(s.o ORDER BY s.at DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object('userId', g.id, 'name', g.name, 'avatarUrl', g.avatar_url, 'at', max(l.created_at), 'count', count(*)) AS o,
           max(l.created_at) AS at
    FROM public.player_likes l
    JOIN public.profiles g ON g.id = l.giver_id
    WHERE l.target_id = p_user AND NOT g.is_ghost
    GROUP BY g.id, g.name, g.avatar_url
    ORDER BY max(l.created_at) DESC
    LIMIT 24
  ) s;
$function$;