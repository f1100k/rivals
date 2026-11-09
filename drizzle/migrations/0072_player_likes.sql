CREATE TABLE public.player_likes (
  giver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (giver_id, target_id),
  CHECK (giver_id <> target_id)
);
CREATE INDEX player_likes_target_idx ON public.player_likes(target_id);
GRANT SELECT ON public.player_likes TO authenticated;
GRANT ALL ON public.player_likes TO service_role;
ALTER TABLE public.player_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own given likes" ON public.player_likes FOR SELECT TO authenticated USING (auth.uid() = giver_id);

CREATE OR REPLACE FUNCTION public.player_reputation(p_user uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.player_likes WHERE target_id = p_user;
$$;
GRANT EXECUTE ON FUNCTION public.player_reputation(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.like_player(p_match uuid, p_target uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_my_team text; v_their_team text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'nao_autenticado'; END IF;
  IF v_me = p_target THEN RAISE EXCEPTION 'Você não pode curtir a si mesmo.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match AND status = 'completed') THEN
    RAISE EXCEPTION 'A partida ainda não foi concluída.'; END IF;
  SELECT team INTO v_my_team FROM match_players WHERE match_id = p_match AND user_id = v_me;
  SELECT mp.team INTO v_their_team FROM match_players mp JOIN profiles p ON p.id = mp.user_id
    WHERE mp.match_id = p_match AND mp.user_id = p_target AND NOT p.is_ghost;
  IF v_my_team IS NULL OR v_their_team IS NULL OR lower(v_my_team) <> lower(v_their_team) THEN
    RAISE EXCEPTION 'Só é possível curtir companheiros do seu time.'; END IF;
  INSERT INTO player_likes(giver_id, target_id, match_id) VALUES (v_me, p_target, p_match)
    ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE EXECUTE ON FUNCTION public.like_player(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.like_player(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_like_matches() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'completedAt' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', m.id, 'completedAt', m.completed_at, 'players',
      (SELECT coalesce(jsonb_agg(jsonb_build_object('userId', p.id, 'name', p.name,
         'liked', EXISTS (SELECT 1 FROM player_likes l WHERE l.giver_id = auth.uid() AND l.target_id = p.id)) ORDER BY p.name), '[]'::jsonb)
       FROM match_players o JOIN profiles p ON p.id = o.user_id
       WHERE o.match_id = m.id AND o.user_id <> auth.uid() AND lower(o.team) = lower(me.team) AND NOT p.is_ghost)) AS x
    FROM match_players me JOIN matches m ON m.id = me.match_id
    WHERE me.user_id = auth.uid() AND m.status = 'completed' AND me.team IS NOT NULL
    ORDER BY m.completed_at DESC LIMIT 10
  ) s;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_like_matches() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_like_matches() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_player_profile(p_user uuid)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
 SELECT jsonb_build_object('id',p.id,'name',p.name,'avatar_url',p.avatar_url,'rating',p.rating,'wins',p.wins,'losses',p.losses,'primary_position',p.primary_position,'secondary_position',p.secondary_position,'reputation',public.player_reputation(p.id),'stats',(SELECT jsonb_build_object('games',count(*),'goals',coalesce(sum(s.goals),0),'assists',coalesce(sum(s.assists),0),'passes',coalesce(sum(s.passes),0),'interceptions',coalesce(sum(s.interceptions),0),'saves',coalesce(sum(s.saves),0),'gk_saves',coalesce(sum(s.saves) FILTER (WHERE mp.position='Goleiro'),0),'gk_games',count(*) FILTER (WHERE mp.position='Goleiro'),'mvps',count(*) FILTER (WHERE s.mvp),'score',coalesce(sum(s.score),0)) FROM public.match_player_stats s JOIN public.matches m ON m.id=s.match_id AND m.status <> 'cancelled' LEFT JOIN public.match_players mp ON mp.match_id=s.match_id AND mp.user_id=s.user_id WHERE s.user_id=p.id)) FROM public.profiles p WHERE p.id=p_user AND NOT p.is_ghost;
$function$;