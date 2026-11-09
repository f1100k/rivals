CREATE TABLE public.league_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  min_games integer NOT NULL DEFAULT 15 CHECK (min_games BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished')),
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
GRANT SELECT ON public.league_events TO anon, authenticated;
GRANT ALL ON public.league_events TO service_role;
ALTER TABLE public.league_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "League events are public" ON public.league_events FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.league_event_results (
  event_id uuid NOT NULL REFERENCES public.league_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  place integer,
  games integer NOT NULL,
  wins integer NOT NULL,
  losses integer NOT NULL,
  mmr_gain integer NOT NULL,
  qualified boolean NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
GRANT SELECT ON public.league_event_results TO anon, authenticated;
GRANT ALL ON public.league_event_results TO service_role;
ALTER TABLE public.league_event_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "League results are public" ON public.league_event_results FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS matches_created_at_idx ON public.matches (created_at);

-- Window actually counted by an event: finished early = up to the finish moment.
CREATE OR REPLACE FUNCTION public.league_window(p_event uuid)
RETURNS TABLE(from_at timestamptz, to_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.starts_at, CASE WHEN e.finished_at IS NOT NULL THEN least(e.ends_at, e.finished_at) ELSE e.ends_at END
  FROM public.league_events e WHERE e.id = p_event
$$;

-- Per-player tally of normal-queue matches (no Mix, no bots, no test pool) inside a window.
CREATE OR REPLACE FUNCTION public.league_tally(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(user_id uuid, games integer, wins integer, losses integer, mmr_gain integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT mp.user_id, count(*)::int,
    count(*) FILTER (WHERE (lower(mp.team) = 'a' AND m.score_a > m.score_b) OR (lower(mp.team) = 'b' AND m.score_b > m.score_a))::int,
    count(*) FILTER (WHERE (lower(mp.team) = 'a' AND m.score_a < m.score_b) OR (lower(mp.team) = 'b' AND m.score_b < m.score_a))::int,
    coalesce(sum(mp.delta), 0)::int
  FROM public.matches m
  JOIN public.match_players mp ON mp.match_id = m.id AND mp.team IS NOT NULL
  JOIN public.profiles p ON p.id = mp.user_id AND NOT p.is_ghost
  WHERE m.status = 'completed' AND NOT m.is_mix AND NOT m.had_bots AND m.region <> 'TESTE'
    AND m.created_at >= p_from AND m.created_at < p_to
  GROUP BY mp.user_id
$$;
REVOKE EXECUTE ON FUNCTION public.league_tally(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_league_events()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'min_games', e.min_games, 'status', e.status, 'finished_at', e.finished_at) ORDER BY e.starts_at DESC), '[]'::jsonb)
  FROM public.league_events e
$$;

-- Ranking of one event: live while active, frozen snapshot once finished.
CREATE OR REPLACE FUNCTION public.get_league_ranking(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.league_events; w record; rows jsonb;
BEGIN
  SELECT * INTO e FROM public.league_events WHERE id = p_event;
  IF NOT FOUND THEN RETURN jsonb_build_object('event', null, 'rows', '[]'::jsonb); END IF;
  IF e.status = 'finished' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'avatar_url', p.avatar_url, 'games', r.games,
      'wins', r.wins, 'losses', r.losses, 'mmr_gain', r.mmr_gain, 'qualified', r.qualified, 'place', r.place)
      ORDER BY r.qualified DESC, r.place NULLS LAST, r.games DESC, r.mmr_gain DESC, p.name), '[]'::jsonb)
    INTO rows FROM public.league_event_results r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.event_id = e.id;
  ELSE
    SELECT * INTO w FROM public.league_window(e.id);
    WITH t AS (SELECT * FROM public.league_tally(w.from_at, w.to_at)),
    q AS (
      SELECT t.*, t.games >= e.min_games AS qualified,
        CASE WHEN t.games >= e.min_games THEN row_number() OVER (PARTITION BY t.games >= e.min_games ORDER BY t.mmr_gain DESC, t.wins DESC, t.games, t.user_id) END AS place
      FROM t
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'avatar_url', p.avatar_url, 'games', q.games,
      'wins', q.wins, 'losses', q.losses, 'mmr_gain', q.mmr_gain, 'qualified', q.qualified, 'place', q.place)
      ORDER BY q.qualified DESC, q.place NULLS LAST, q.games DESC, q.mmr_gain DESC, p.name), '[]'::jsonb)
    INTO rows FROM q JOIN public.profiles p ON p.id = q.user_id;
  END IF;
  RETURN jsonb_build_object('event', jsonb_build_object('id', e.id, 'name', e.name, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'min_games', e.min_games, 'status', e.status, 'finished_at', e.finished_at), 'rows', rows);
END $$;

-- Stat leaders (goals, saves, MVPs…) limited to the event's normal-queue matches.
CREATE OR REPLACE FUNCTION public.get_league_stat_leaders(p_event uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x.goals DESC), '[]'::jsonb) FROM (
    SELECT p.id, p.name, p.avatar_url, count(*)::int AS games,
      sum(s.goals)::int AS goals, sum(s.assists)::int AS assists, sum(s.passes)::int AS passes,
      sum(s.interceptions)::int AS interceptions, sum(s.saves)::int AS saves,
      coalesce(sum(s.saves) FILTER (WHERE mp.position = 'Goleiro'), 0)::int AS gk_saves,
      count(*) FILTER (WHERE mp.position = 'Goleiro')::int AS gk_games,
      count(*) FILTER (WHERE s.mvp)::int AS mvps
    FROM public.league_window(p_event) w, public.match_player_stats s
    JOIN public.profiles p ON p.id = s.user_id
    JOIN public.matches m ON m.id = s.match_id AND m.status = 'completed' AND NOT m.is_mix AND NOT m.had_bots AND m.region <> 'TESTE'
    LEFT JOIN public.match_players mp ON mp.match_id = s.match_id AND mp.user_id = s.user_id
    WHERE NOT p.is_ghost AND m.created_at >= w.from_at AND m.created_at < w.to_at
    GROUP BY p.id, p.name, p.avatar_url
  ) x
$$;

CREATE OR REPLACE FUNCTION public.admin_save_league_event(p_id uuid, p_name text, p_starts timestamptz, p_ends timestamptz, p_min_games integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'nome_invalido'; END IF;
  IF p_starts IS NULL OR p_ends IS NULL OR p_ends <= p_starts THEN RAISE EXCEPTION 'fim_antes_do_inicio'; END IF;
  IF p_min_games IS NULL OR p_min_games NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'minimo_invalido'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.league_events (name, starts_at, ends_at, min_games, created_by)
    VALUES (btrim(p_name), p_starts, p_ends, p_min_games, auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.league_events SET name = btrim(p_name), starts_at = p_starts, ends_at = p_ends, min_games = p_min_games
    WHERE id = p_id AND status = 'active' RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'evento_finalizado'; END IF;
  END IF;
  INSERT INTO public.mod_actions (actor_id, action, reason) VALUES (auth.uid(), 'league_event_save', btrim(p_name));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_finish_league_event(p_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.league_events; v_to timestamptz; n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT * INTO e FROM public.league_events WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'evento_inexistente'; END IF;
  IF e.status <> 'active' THEN RAISE EXCEPTION 'evento_finalizado'; END IF;
  v_to := least(e.ends_at, now());
  DELETE FROM public.league_event_results WHERE event_id = e.id;
  INSERT INTO public.league_event_results (event_id, user_id, place, games, wins, losses, mmr_gain, qualified)
  SELECT e.id, t.user_id,
    CASE WHEN t.games >= e.min_games THEN row_number() OVER (PARTITION BY t.games >= e.min_games ORDER BY t.mmr_gain DESC, t.wins DESC, t.games, t.user_id) END,
    t.games, t.wins, t.losses, t.mmr_gain, t.games >= e.min_games
  FROM public.league_tally(e.starts_at, v_to) t;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.league_events SET status = 'finished', finished_at = now() WHERE id = e.id;
  INSERT INTO public.mod_actions (actor_id, action, reason) VALUES (auth.uid(), 'league_event_finish', e.name || ' · ' || n || ' jogadores');
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_league_event(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  DELETE FROM public.league_events WHERE id = p_id RETURNING name INTO v_name;
  IF v_name IS NULL THEN RAISE EXCEPTION 'evento_inexistente'; END IF;
  INSERT INTO public.mod_actions (actor_id, action, reason) VALUES (auth.uid(), 'league_event_delete', v_name);
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_save_league_event(uuid, text, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_finish_league_event(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_league_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_league_event(uuid, text, timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finish_league_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_league_event(uuid) TO authenticated;