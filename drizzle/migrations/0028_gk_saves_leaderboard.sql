CREATE OR REPLACE FUNCTION public.get_stat_leaders()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(x ORDER BY x.goals DESC), '[]'::jsonb) FROM (
    SELECT p.id, p.name, p.avatar_url, count(*)::int AS games,
      sum(s.goals)::int AS goals, sum(s.assists)::int AS assists, sum(s.passes)::int AS passes,
      sum(s.interceptions)::int AS interceptions, sum(s.saves)::int AS saves,
      coalesce(sum(s.saves) FILTER (WHERE mp.position = 'Goleiro'), 0)::int AS gk_saves,
      count(*) FILTER (WHERE mp.position = 'Goleiro')::int AS gk_games,
      count(*) FILTER (WHERE s.mvp)::int AS mvps
    FROM match_player_stats s JOIN profiles p ON p.id = s.user_id
    JOIN matches m ON m.id = s.match_id AND m.status <> 'cancelled'
    LEFT JOIN match_players mp ON mp.match_id = s.match_id AND mp.user_id = s.user_id
    WHERE NOT p.is_ghost
    GROUP BY p.id, p.name, p.avatar_url
  ) x
$function$;