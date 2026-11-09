ALTER TABLE public.mix_ranking_exclusions ADD COLUMN IF NOT EXISTS counts_as text CHECK (counts_as IN ('win','loss'));
COMMENT ON COLUMN public.mix_ranking_exclusions.counts_as IS 'NULL = match removed from this player''s Mix ranking; win/loss = counted with this outcome in the Mix ranking only.';

CREATE OR REPLACE FUNCTION public.get_mix_ranking() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.balance DESC, x.wins DESC, x.losses, x.name), '[]'::jsonb) FROM (
    SELECT g.id, g.name, g.avatar_url, g.rating,
      count(*) FILTER (WHERE g.won)::int AS wins,
      count(*) FILTER (WHERE NOT g.won)::int AS losses,
      (count(*) FILTER (WHERE g.won) - count(*) FILTER (WHERE NOT g.won))::int AS balance
    FROM (
      SELECT p.id, p.name, p.avatar_url, p.rating,
        CASE WHEN e.counts_as IS NOT NULL THEN e.counts_as = 'win'
             ELSE mp.team = CASE WHEN m.score_a > m.score_b THEN 'a' ELSE 'b' END END AS won
      FROM public.matches m
      JOIN public.match_players mp ON mp.match_id = m.id AND mp.team IS NOT NULL
      JOIN public.profiles p ON p.id = mp.user_id AND NOT p.is_ghost
      LEFT JOIN public.mix_ranking_exclusions e ON e.match_id = m.id AND e.user_id = mp.user_id
      WHERE m.is_mix AND m.status = 'completed' AND m.region <> 'TESTE' AND NOT m.had_bots
        AND m.score_a IS NOT NULL AND m.score_b IS NOT NULL AND m.score_a <> m.score_b
        AND (e.match_id IS NULL OR e.counts_as IS NOT NULL)
    ) g
    GROUP BY g.id, g.name, g.avatar_url, g.rating
    LIMIT 200
  ) x;
$$;
GRANT EXECUTE ON FUNCTION public.get_mix_ranking() TO anon, authenticated, service_role;