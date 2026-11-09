CREATE OR REPLACE FUNCTION public.player_like_supporters(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(s.o ORDER BY s.at DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object('userId', g.id, 'name', g.name, 'avatarUrl', g.avatar_url, 'at', l.created_at) AS o,
           l.created_at AS at
    FROM public.player_likes l
    JOIN public.profiles g ON g.id = l.giver_id
    WHERE l.target_id = p_user AND NOT g.is_ghost
    ORDER BY l.created_at DESC
    LIMIT 24
  ) s;
$$;

GRANT EXECUTE ON FUNCTION public.player_like_supporters(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.player_reputation(p_user uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.player_likes l
  JOIN public.profiles g ON g.id = l.giver_id
  WHERE l.target_id = p_user AND NOT g.is_ghost;
$$;

CREATE OR REPLACE FUNCTION public.get_player_profile(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 SELECT jsonb_build_object('id',p.id,'name',p.name,'avatar_url',p.avatar_url,'rating',p.rating,'wins',p.wins,'losses',p.losses,'primary_position',p.primary_position,'secondary_position',p.secondary_position,'reputation',public.player_reputation(p.id),'likes',public.player_like_supporters(p.id),'stats',(SELECT jsonb_build_object('games',count(*),'goals',coalesce(sum(s.goals),0),'assists',coalesce(sum(s.assists),0),'passes',coalesce(sum(s.passes),0),'interceptions',coalesce(sum(s.interceptions),0),'saves',coalesce(sum(s.saves),0),'gk_saves',coalesce(sum(s.saves) FILTER (WHERE mp.position='Goleiro'),0),'gk_games',count(*) FILTER (WHERE mp.position='Goleiro'),'mvps',count(*) FILTER (WHERE s.mvp),'score',coalesce(sum(s.score),0)) FROM public.match_player_stats s JOIN public.matches m ON m.id=s.match_id AND m.status <> 'cancelled' LEFT JOIN public.match_players mp ON mp.match_id=s.match_id AND mp.user_id=s.user_id WHERE s.user_id=p.id)) FROM public.profiles p WHERE p.id=p_user AND NOT p.is_ghost;
$function$;