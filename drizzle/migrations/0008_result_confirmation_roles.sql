CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'player');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'moderator'))
$$;

CREATE TABLE public.mod_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_user uuid,
  target_match uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mod_actions TO authenticated;
GRANT ALL ON public.mod_actions TO service_role;
ALTER TABLE public.mod_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read actions" ON public.mod_actions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

ALTER TABLE public.profiles ADD COLUMN banned_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN ban_reason text;
ALTER TABLE public.matches ADD COLUMN report_a integer;
ALTER TABLE public.matches ADD COLUMN report_b integer;
ALTER TABLE public.matches ADD COLUMN reported_by uuid;
ALTER TABLE public.match_players ADD COLUMN confirm boolean;

-- Elo finalization, runs once per match.
CREATE OR REPLACE FUNCTION public.finalize_match_gk(p_match uuid, p_a int, p_b int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result int; v_a numeric; v_b numeric; v_da int; v_db int;
BEGIN
  PERFORM 1 FROM matches WHERE id = p_match AND status IN ('room','voting','reporting','disputed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'partida_ja_finalizada'; END IF;
  IF p_a = p_b THEN RAISE EXCEPTION 'empate_nao_permitido'; END IF;
  v_result := CASE WHEN p_a > p_b THEN 1 ELSE 0 END;
  SELECT avg(rating_before) FILTER (WHERE team='a'), avg(rating_before) FILTER (WHERE team='b')
    INTO v_a, v_b FROM match_players WHERE match_id = p_match;
  v_da := round(32 * (v_result::numeric - 1 / (1 + power(10, (v_b - v_a) / 400.0))));
  v_db := round(32 * ((1 - v_result)::numeric - 1 / (1 + power(10, (v_a - v_b) / 400.0))));
  UPDATE match_players SET delta = v_da WHERE match_id = p_match AND team = 'a';
  UPDATE match_players SET delta = v_db WHERE match_id = p_match AND team = 'b';
  UPDATE profiles pr SET rating = pr.rating + v_da, wins = pr.wins + v_result, losses = pr.losses + (1 - v_result)
    WHERE pr.id IN (SELECT user_id FROM match_players WHERE match_id = p_match AND team = 'a');
  UPDATE profiles pr SET rating = pr.rating + v_db, wins = pr.wins + (1 - v_result), losses = pr.losses + v_result
    WHERE pr.id IN (SELECT user_id FROM match_players WHERE match_id = p_match AND team = 'b');
  UPDATE matches SET score_a = p_a, score_b = p_b, status = 'completed', completed_at = now() WHERE id = p_match;
END $$;
REVOKE EXECUTE ON FUNCTION public.finalize_match_gk(uuid, int, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_result_gk(p_a int, p_b int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_match uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_a < 0 OR p_b < 0 OR p_a > 99 OR p_b > 99 THEN RAISE EXCEPTION 'placar_invalido'; END IF;
  IF p_a = p_b THEN RAISE EXCEPTION 'empate_nao_permitido'; END IF;
  SELECT mp.match_id INTO v_match FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_uid AND m.status IN ('room','voting') LIMIT 1 ;
  IF v_match IS NULL THEN RAISE EXCEPTION 'sem_partida_para_reportar'; END IF;
  UPDATE matches SET status = 'reporting', report_a = p_a, report_b = p_b, reported_by = v_uid WHERE id = v_match;
  UPDATE match_players SET confirm = NULL WHERE match_id = v_match;
  UPDATE match_players SET confirm = true WHERE match_id = v_match
    AND (user_id = v_uid OR user_id IN (SELECT id FROM profiles WHERE is_ghost));
  IF (SELECT count(*) FROM match_players WHERE match_id = v_match AND confirm) >= 6 THEN
    PERFORM finalize_match_gk(v_match, p_a, p_b);
    RETURN 'completed';
  END IF;
  RETURN 'reporting';
END $$;

CREATE OR REPLACE FUNCTION public.confirm_result_gk(p_ok boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_match uuid; v_a int; v_b int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.id, m.report_a, m.report_b INTO v_match, v_a, v_b FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_uid AND m.status = 'reporting' LIMIT 1 FOR UPDATE OF m;
  IF v_match IS NULL THEN RAISE EXCEPTION 'sem_resultado_para_confirmar'; END IF;
  UPDATE match_players SET confirm = p_ok WHERE match_id = v_match AND user_id = v_uid;
  IF NOT p_ok THEN
    UPDATE matches SET status = 'disputed' WHERE id = v_match;
    RETURN 'disputed';
  END IF;
  IF (SELECT count(*) FROM match_players WHERE match_id = v_match AND confirm) >= 6 THEN
    PERFORM finalize_match_gk(v_match, v_a, v_b);
    RETURN 'completed';
  END IF;
  RETURN 'reporting';
END $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_match(p_match uuid, p_a int, p_b int, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  PERFORM finalize_match_gk(p_match, p_a, p_b);
  INSERT INTO mod_actions (actor_id, action, target_match, reason) VALUES (auth.uid(), 'resolver_partida', p_match, format('%s x %s · %s', p_a, p_b, coalesce(p_reason,'')));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_cancel_match(p_match uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  UPDATE matches SET status = 'cancelled', completed_at = now() WHERE id = p_match AND status <> 'completed';
  INSERT INTO mod_actions (actor_id, action, target_match, reason) VALUES (auth.uid(), 'cancelar_partida', p_match, p_reason);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_ban(p_user uuid, p_hours int, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF public.has_role(p_user, 'admin') THEN RAISE EXCEPTION 'nao_pode_banir_admin'; END IF;
  UPDATE profiles SET banned_until = CASE WHEN p_hours <= 0 THEN NULL ELSE now() + make_interval(hours => p_hours) END,
    ban_reason = CASE WHEN p_hours <= 0 THEN NULL ELSE p_reason END WHERE id = p_user;
  DELETE FROM queue WHERE user_id = p_user AND p_hours > 0;
  INSERT INTO mod_actions (actor_id, action, target_user, reason)
    VALUES (auth.uid(), CASE WHEN p_hours <= 0 THEN 'remover_punicao' ELSE format('suspender_%sh', p_hours) END, p_user, p_reason);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_kick_queue(p_user uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  DELETE FROM queue WHERE user_id = p_user;
  INSERT INTO mod_actions (actor_id, action, target_user, reason) VALUES (auth.uid(), 'remover_da_fila', p_user, p_reason);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_role(p_user uuid, p_role public.app_role, p_on boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_on THEN INSERT INTO user_roles (user_id, role) VALUES (p_user, p_role) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM user_roles WHERE user_id = p_user AND role = p_role; END IF;
  INSERT INTO mod_actions (actor_id, action, target_user) VALUES (auth.uid(), format('%s_%s', CASE WHEN p_on THEN 'dar' ELSE 'tirar' END, p_role), p_user);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_overview()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v json;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT json_build_object(
    'isAdmin', public.has_role(auth.uid(), 'admin'),
    'stats', json_build_object(
      'users', (SELECT count(*) FROM profiles WHERE NOT is_ghost),
      'queue', (SELECT count(*) FROM queue),
      'live', (SELECT count(*) FROM matches WHERE status IN ('draft','room','voting')),
      'reporting', (SELECT count(*) FROM matches WHERE status = 'reporting'),
      'disputed', (SELECT count(*) FROM matches WHERE status = 'disputed')),
    'matches', coalesce((SELECT json_agg(x ORDER BY x."createdAt" DESC) FROM (
      SELECT m.id, m.status, m.report_a AS "reportA", m.report_b AS "reportB", m.created_at AS "createdAt",
        (SELECT name FROM profiles WHERE id = m.reported_by) AS "reportedBy",
        (SELECT json_agg(json_build_object('name', pr.name, 'team', mp.team, 'confirm', mp.confirm) ORDER BY mp.team)
          FROM match_players mp JOIN profiles pr ON pr.id = mp.user_id WHERE mp.match_id = m.id) AS players
      FROM matches m WHERE m.status IN ('draft','room','voting','reporting','disputed')) x), '[]'::json),
    'queue', coalesce((SELECT json_agg(json_build_object('userId', q.user_id, 'name', p.name, 'position', q.position, 'joinedAt', q.joined_at) ORDER BY q.joined_at)
      FROM queue q JOIN profiles p ON p.id = q.user_id), '[]'::json),
    'users', coalesce((SELECT json_agg(u ORDER BY u.name) FROM (
      SELECT p.id, p.name, p.rating, p.banned_until AS "bannedUntil", p.ban_reason AS "banReason", p.is_ghost AS "isGhost",
        coalesce((SELECT json_agg(role) FROM user_roles r WHERE r.user_id = p.id), '[]'::json) AS roles
      FROM profiles p) u), '[]'::json),
    'actions', coalesce((SELECT json_agg(a) FROM (
      SELECT a.action, a.reason, a.created_at AS "createdAt",
        (SELECT name FROM profiles WHERE id = a.actor_id) AS actor,
        (SELECT name FROM profiles WHERE id = a.target_user) AS target
      FROM mod_actions a ORDER BY a.created_at DESC LIMIT 50) a), '[]'::json)
  ) INTO v;
  RETURN v;
END $$;

-- Block banned players and include new statuses.
CREATE OR REPLACE FUNCTION public.join_queue_gk(p_position text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_position NOT IN ('Goleiro', 'Pivô', 'Ala', 'Fixo') THEN RAISE EXCEPTION 'invalid_position'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND banned_until > now()) THEN RAISE EXCEPTION 'jogador_suspenso'; END IF;
  IF EXISTS (SELECT 1 FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = auth.uid() AND m.status IN ('ready','lobby','draft','room','voting','reporting','disputed')) THEN
    RETURN false;
  END IF;
  DELETE FROM queue WHERE user_id = auth.uid();
  INSERT INTO queue (user_id, mode, region, position) VALUES (auth.uid(), 5, 'SA', p_position);
  PERFORM try_matchmake_gk();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.get_inhouse_state_gk()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_me json; v_queue json; v_counts json; v_match json; v_last json;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT (to_jsonb(p) || jsonb_build_object('isStaff', public.is_staff(v_uid)))::json INTO v_me FROM profiles p WHERE p.id = v_uid;
  SELECT to_jsonb(q)::json INTO v_queue FROM queue q WHERE q.user_id = v_uid;
  SELECT json_build_object('total', count(*),
    'goalkeepers', count(*) FILTER (WHERE position = 'Goleiro'),
    'outfield', count(*) FILTER (WHERE position IS NOT NULL AND position <> 'Goleiro'))::json
    INTO v_counts FROM queue WHERE position IS NOT NULL;
  SELECT to_jsonb(x)::json INTO v_match FROM (
    SELECT m.id, m.status, m.room_code AS "roomCode", m.created_at AS "createdAt",
      m.report_a AS "reportA", m.report_b AS "reportB",
      (SELECT name FROM profiles WHERE id = m.reported_by) AS "reportedBy",
      coalesce(json_agg(json_build_object('userId', mp.user_id, 'name', pr.name, 'rating', mp.rating_before,
        'position', mp.position, 'team', mp.team, 'vote', mp.vote, 'confirm', mp.confirm, 'isMe', mp.user_id = v_uid)
        ORDER BY mp.team NULLS LAST, (mp.position = 'Goleiro') DESC, mp.rating_before DESC), '[]'::json) AS players
    FROM matches m JOIN match_players mp ON mp.match_id = m.id JOIN profiles pr ON pr.id = mp.user_id
    WHERE m.status IN ('draft','room','voting','reporting','disputed')
      AND EXISTS (SELECT 1 FROM match_players mine WHERE mine.match_id = m.id AND mine.user_id = v_uid)
    GROUP BY m.id) x;
  SELECT to_jsonb(h)::json INTO v_last FROM (
    SELECT m.score_a AS "scoreA", m.score_b AS "scoreB", m.completed_at AS "completedAt",
      json_agg(json_build_object('name', pr.name, 'team', mp.team, 'delta', mp.delta) ORDER BY mp.team, mp.rating_before DESC) AS players
    FROM matches m JOIN match_players mp ON mp.match_id = m.id JOIN profiles pr ON pr.id = mp.user_id
    WHERE m.status = 'completed' AND EXISTS (SELECT 1 FROM match_players mine WHERE mine.match_id = m.id AND mine.user_id = v_uid)
    GROUP BY m.id ORDER BY m.completed_at DESC LIMIT 1) h;
  RETURN json_build_object('me', v_me, 'queue', v_queue, 'counts', v_counts, 'match', v_match, 'lastResult', v_last);
END $$;

COMMENT ON FUNCTION public.vote_match(text) IS 'DEPRECATED: replaced by report_result_gk + confirm_result_gk';