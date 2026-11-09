CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number integer NOT NULL UNIQUE CHECK (number >= 0),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','finished')),
  planned_start timestamptz,
  planned_end timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end > planned_start)
);
GRANT SELECT ON public.seasons TO anon, authenticated;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY seasons_read ON public.seasons FOR SELECT TO anon, authenticated USING (true);
CREATE UNIQUE INDEX seasons_one_active ON public.seasons ((true)) WHERE status = 'active';

-- Win/loss counters at the moment a season starts (season W/L = counters at finish minus these).
CREATE TABLE public.season_baselines (
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wins integer NOT NULL,
  losses integer NOT NULL,
  PRIMARY KEY (season_id, user_id)
);
GRANT ALL ON public.season_baselines TO service_role;
ALTER TABLE public.season_baselines ENABLE ROW LEVEL SECURITY;

-- Frozen per-player statistics written when a season is finished.
CREATE TABLE public.season_player_stats (
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  final_rank integer,
  final_rating integer NOT NULL,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  goals integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  passes integer NOT NULL DEFAULT 0,
  interceptions integer NOT NULL DEFAULT 0,
  gk_saves integer NOT NULL DEFAULT 0,
  gk_games integer NOT NULL DEFAULT 0,
  mvps integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, user_id)
);
GRANT SELECT ON public.season_player_stats TO anon, authenticated;
GRANT ALL ON public.season_player_stats TO service_role;
ALTER TABLE public.season_player_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY season_stats_read ON public.season_player_stats FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.player_profile_tags ADD COLUMN season_id uuid REFERENCES public.seasons(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.active_season_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.seasons WHERE status = 'active' LIMIT 1
$$;

-- Match statistics (not W/L) of one player inside a time window.
CREATE OR REPLACE FUNCTION public.season_match_stats(p_user uuid, p_from timestamptz, p_to timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'goals', coalesce(sum(s.goals),0), 'assists', coalesce(sum(s.assists),0), 'passes', coalesce(sum(s.passes),0),
    'interceptions', coalesce(sum(s.interceptions),0),
    'gk_saves', coalesce(sum(s.saves) FILTER (WHERE mp.position = 'Goleiro'),0),
    'gk_games', count(*) FILTER (WHERE mp.position = 'Goleiro'),
    'mvps', count(*) FILTER (WHERE s.mvp),
    'likes', (SELECT count(*) FROM public.player_likes l WHERE l.target_id = p_user AND l.created_at >= p_from AND l.created_at < p_to))
  FROM public.match_player_stats s
  JOIN public.matches m ON m.id = s.match_id AND m.status <> 'cancelled' AND m.region <> 'TESTE' AND NOT m.had_bots
    AND m.created_at >= p_from AND m.created_at < p_to
  LEFT JOIN public.match_players mp ON mp.match_id = s.match_id AND mp.user_id = s.user_id
  WHERE s.user_id = p_user
$$;

CREATE OR REPLACE FUNCTION public.get_seasons() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'number',number,'name',name,'status',status,
    'planned_start',planned_start,'planned_end',planned_end,'started_at',started_at,'finished_at',finished_at,
    'players',(SELECT count(*) FROM public.season_player_stats x WHERE x.season_id = s.id)) ORDER BY number DESC), '[]'::jsonb)
  FROM public.seasons s
$$;

CREATE OR REPLACE FUNCTION public.admin_save_season(p_id uuid, p_number integer, p_name text, p_planned_start timestamptz, p_planned_end timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; v_status text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_number IS NULL OR p_number < 0 THEN RAISE EXCEPTION 'numero_invalido'; END IF;
  IF p_planned_start IS NOT NULL AND p_planned_end IS NOT NULL AND p_planned_end <= p_planned_start THEN RAISE EXCEPTION 'fim_antes_do_inicio'; END IF;
  IF p_id IS NOT NULL THEN SELECT status INTO v_status FROM public.seasons WHERE id = p_id FOR UPDATE; END IF;
  IF v_status = 'finished' THEN
    UPDATE public.seasons SET name = coalesce(nullif(trim(p_name),''), name) WHERE id = p_id RETURNING id INTO v;
  ELSIF v_status IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.seasons WHERE number = p_number AND id <> p_id) THEN RAISE EXCEPTION 'numero_repetido'; END IF;
    UPDATE public.seasons SET number = p_number, name = coalesce(nullif(trim(p_name),''), 'Season '||p_number),
      planned_start = p_planned_start, planned_end = p_planned_end WHERE id = p_id RETURNING id INTO v;
  ELSE
    IF EXISTS (SELECT 1 FROM public.seasons WHERE number = p_number) THEN RAISE EXCEPTION 'numero_repetido'; END IF;
    INSERT INTO public.seasons(number, name, planned_start, planned_end, created_by)
    VALUES (p_number, coalesce(nullif(trim(p_name),''), 'Season '||p_number), p_planned_start, p_planned_end, auth.uid()) RETURNING id INTO v;
  END IF;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'season_saved', v::text||': Season '||p_number);
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_season(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  DELETE FROM public.seasons WHERE id = p_id AND status = 'planned';
  IF NOT FOUND THEN RAISE EXCEPTION 'so_season_nao_iniciada'; END IF;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'season_deleted', p_id::text);
  RETURN true;
END $$;

-- p_from_beginning: count everything since the site began (no baseline); otherwise counting starts now.
CREATE OR REPLACE FUNCTION public.admin_start_season(p_id uuid, p_from_beginning boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_start timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('season_state'));
  SELECT status INTO v_status FROM public.seasons WHERE id = p_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'season_inexistente'; END IF;
  IF v_status <> 'planned' THEN RAISE EXCEPTION 'season_ja_iniciada'; END IF;
  IF EXISTS (SELECT 1 FROM public.seasons WHERE status = 'active') THEN RAISE EXCEPTION 'outra_season_ativa'; END IF;
  IF p_from_beginning THEN
    SELECT least(coalesce((SELECT min(created_at) FROM public.profiles), now()), coalesce((SELECT min(created_at) FROM public.matches), now())) INTO v_start;
  ELSE
    v_start := now();
    INSERT INTO public.season_baselines(season_id, user_id, wins, losses)
    SELECT p_id, id, wins, losses FROM public.profiles WHERE NOT is_ghost;
  END IF;
  UPDATE public.seasons SET status = 'active', started_at = v_start WHERE id = p_id;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'season_started', p_id::text);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_finish_season(p_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_start timestamptz; v_end timestamptz := now(); n integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('season_state'));
  SELECT status, started_at INTO v_status, v_start FROM public.seasons WHERE id = p_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'season_inexistente'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'season_nao_ativa'; END IF;
  DELETE FROM public.season_player_stats WHERE season_id = p_id;
  WITH ranked AS (
    SELECT p.id, p.rating, row_number() OVER (ORDER BY p.rating DESC, p.wins DESC, p.name)::int AS pos,
      greatest(p.wins - coalesce(b.wins,0), 0) AS w, greatest(p.losses - coalesce(b.losses,0), 0) AS l
    FROM public.profiles p LEFT JOIN public.season_baselines b ON b.season_id = p_id AND b.user_id = p.id
    WHERE NOT p.is_ghost
  ), full_rows AS (
    SELECT r.*, public.season_match_stats(r.id, v_start, v_end) AS st FROM ranked r
  )
  INSERT INTO public.season_player_stats(season_id, user_id, final_rank, final_rating, wins, losses, goals, assists, passes, interceptions, gk_saves, gk_games, mvps, likes)
  SELECT p_id, id, pos, rating, w, l, (st->>'goals')::int, (st->>'assists')::int, (st->>'passes')::int, (st->>'interceptions')::int,
    (st->>'gk_saves')::int, (st->>'gk_games')::int, (st->>'mvps')::int, (st->>'likes')::int
  FROM full_rows
  WHERE w + l > 0 OR (st->>'goals')::int + (st->>'assists')::int + (st->>'passes')::int + (st->>'interceptions')::int + (st->>'gk_games')::int + (st->>'mvps')::int > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- Titles granted during this season before titles carried a season now belong to it.
  UPDATE public.player_profile_tags SET season_id = p_id WHERE season_id IS NULL AND granted_at >= v_start AND granted_at <= v_end;
  UPDATE public.seasons SET status = 'finished', finished_at = v_end WHERE id = p_id;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'season_finished', p_id::text||': '||n||' jogadores');
  RETURN n;
END $$;

-- Seasons a player took part in (active = live numbers, finished = frozen) plus every title they own.
CREATE OR REPLACE FUNCTION public.get_player_seasons(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seasons jsonb := '[]'::jsonb; v_tags jsonb; r record; v_p record; st jsonb; v_rank int; b record;
BEGIN
  SELECT id, rating, wins, losses INTO v_p FROM public.profiles WHERE id = p_user AND NOT is_ghost;
  IF v_p.id IS NULL THEN RETURN NULL; END IF;
  FOR r IN SELECT * FROM public.seasons WHERE status IN ('active','finished') ORDER BY number DESC LOOP
    IF r.status = 'finished' THEN
      SELECT jsonb_build_object('wins',x.wins,'losses',x.losses,'goals',x.goals,'assists',x.assists,'passes',x.passes,'interceptions',x.interceptions,
        'gk_saves',x.gk_saves,'gk_games',x.gk_games,'mvps',x.mvps,'likes',x.likes,'final_rank',x.final_rank,'final_rating',x.final_rating)
      INTO st FROM public.season_player_stats x WHERE x.season_id = r.id AND x.user_id = p_user;
    ELSE
      SELECT wins, losses INTO b FROM public.season_baselines WHERE season_id = r.id AND user_id = p_user;
      SELECT count(*) + 1 INTO v_rank FROM public.profiles WHERE NOT is_ghost AND rating > v_p.rating;
      st := public.season_match_stats(p_user, r.started_at, now()) || jsonb_build_object(
        'wins', greatest(v_p.wins - coalesce(b.wins,0),0), 'losses', greatest(v_p.losses - coalesce(b.losses,0),0),
        'final_rank', v_rank, 'final_rating', v_p.rating);
    END IF;
    v_seasons := v_seasons || jsonb_build_array(jsonb_build_object('id',r.id,'number',r.number,'name',r.name,'status',r.status,
      'started_at',r.started_at,'finished_at',r.finished_at,'planned_end',r.planned_end,'stats',st));
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'text_color',t.text_color,'background_color',t.background_color,'effect',t.effect,
    'equipped',pt.equipped,'granted_at',pt.granted_at,'season_id',pt.season_id,'season_number',s.number,'season_name',s.name) ORDER BY pt.granted_at), '[]'::jsonb)
  INTO v_tags FROM public.player_profile_tags pt JOIN public.profile_tags t ON t.id = pt.tag_id LEFT JOIN public.seasons s ON s.id = pt.season_id
  WHERE pt.user_id = p_user;
  RETURN jsonb_build_object('seasons', v_seasons, 'tags', v_tags);
END $$;

-- Titles granted from now on belong to the active season unless the admin picks another.
CREATE OR REPLACE FUNCTION public.admin_grant_profile_tag_season(p_tag uuid, p_users uuid[], p_remove boolean, p_season uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$ DECLARE n integer; v_name text; v_season_name text; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente admins.'; END IF;
SELECT name INTO v_name FROM public.profile_tags WHERE id=p_tag;
IF NOT FOUND THEN RAISE EXCEPTION 'Tag inexistente.'; END IF;
IF p_season IS NOT NULL THEN SELECT name INTO v_season_name FROM public.seasons WHERE id = p_season; IF NOT FOUND THEN RAISE EXCEPTION 'season_inexistente'; END IF; END IF;
IF p_remove THEN
  DELETE FROM public.player_profile_tags WHERE tag_id=p_tag AND user_id=ANY(p_users);
  GET DIAGNOSTICS n=ROW_COUNT;
ELSE
  WITH ins AS (
    INSERT INTO public.player_profile_tags(user_id,tag_id,granted_by,season_id)
    SELECT id,p_tag,auth.uid(),p_season FROM public.profiles WHERE id=ANY(p_users) AND NOT is_ghost ON CONFLICT DO NOTHING RETURNING user_id)
  INSERT INTO public.user_notifications(user_id,kind,title,body)
  SELECT user_id,'tag','Você recebeu um título','Título "'||v_name||'"'||coalesce(' ('||v_season_name||')','')||' disponível em Perfil → Meus títulos.' FROM ins;
  GET DIAGNOSTICS n=ROW_COUNT;
END IF;
INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),CASE WHEN p_remove THEN 'profile_tag_revoked' ELSE 'profile_tag_granted' END,p_tag::text||coalesce(' ['||v_season_name||']','')||': '||array_to_string(p_users,',')); RETURN n; END $function$;

CREATE OR REPLACE FUNCTION public.admin_grant_profile_tag(p_tag uuid, p_users uuid[], p_remove boolean DEFAULT false)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.admin_grant_profile_tag_season(p_tag, p_users, p_remove, public.active_season_id())
$$;

CREATE OR REPLACE FUNCTION public.get_equipped_profile_tags() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',t.name,'text_color',t.text_color,'background_color',t.background_color,'effect',t.effect,'season_number',s.number)),'[]'::jsonb)
FROM public.player_profile_tags p JOIN public.profile_tags t ON t.id=p.tag_id LEFT JOIN public.seasons s ON s.id = p.season_id WHERE p.equipped $function$;

REVOKE ALL ON FUNCTION public.admin_save_season(uuid,integer,text,timestamptz,timestamptz), public.admin_delete_season(uuid),
  public.admin_start_season(uuid,boolean), public.admin_finish_season(uuid), public.admin_grant_profile_tag_season(uuid,uuid[],boolean,uuid),
  public.season_match_stats(uuid,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_season(uuid,integer,text,timestamptz,timestamptz), public.admin_delete_season(uuid),
  public.admin_start_season(uuid,boolean), public.admin_finish_season(uuid), public.admin_grant_profile_tag_season(uuid,uuid[],boolean,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.season_match_stats(uuid,timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seasons(), public.get_player_seasons(uuid), public.active_season_id() TO anon, authenticated, service_role;