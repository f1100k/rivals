-- Players may only edit presentation fields; rating, record, sanctions and name go through checked RPCs.
REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (avatar_url, banner_url, primary_position, secondary_position) ON public.profiles TO authenticated;

-- Sanction details are exposed only through staff/owner RPCs.
REVOKE SELECT ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, name, rating, wins, losses, created_at, is_ghost, avatar_url, primary_position, secondary_position, win_streak, best_win_streak, banner_url)
  ON public.profiles TO anon, authenticated;

-- The legacy mode/region flow can delete live matches, drain the queue and finalize without a print.
REVOKE ALL ON FUNCTION public.join_queue(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leave_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_accept(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_decline(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_cleanup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_report(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vote_match(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_matchmake() FROM PUBLIC, anon, authenticated;

-- Compatibility score confirmation: six confirmations close a match only against the approved print.
CREATE FUNCTION public.close_confirmed_report_gk(p_match uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_a integer; v_b integer; v_sa integer; v_sb integer; v_ok boolean;
BEGIN
  IF (SELECT count(*) FROM match_players WHERE match_id = p_match AND confirm) < 6 THEN RETURN 'reporting'; END IF;
  SELECT report_a, report_b, shot_score_a, shot_score_b, shot_approved INTO v_a, v_b, v_sa, v_sb, v_ok FROM matches WHERE id = p_match;
  IF NOT v_ok OR v_sa IS DISTINCT FROM v_a OR v_sb IS DISTINCT FROM v_b THEN RETURN 'awaiting_screenshot'; END IF;
  PERFORM finalize_match_gk(p_match, v_a, v_b);
  RETURN 'completed';
END $$;
REVOKE ALL ON FUNCTION public.close_confirmed_report_gk(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_result_gk(p_a integer, p_b integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_match uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_a < 0 OR p_b < 0 OR p_a > 99 OR p_b > 99 THEN RAISE EXCEPTION 'placar_invalido'; END IF;
  IF p_a = p_b THEN RAISE EXCEPTION 'empate_nao_permitido'; END IF;
  SELECT mp.match_id INTO v_match FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_uid AND m.status IN ('room','voting') ORDER BY m.created_at DESC LIMIT 1 FOR UPDATE OF m;
  IF v_match IS NULL THEN RAISE EXCEPTION 'sem_partida_para_reportar'; END IF;
  UPDATE matches SET status = 'reporting', report_a = p_a, report_b = p_b, reported_by = v_uid WHERE id = v_match;
  UPDATE match_players SET confirm = NULL WHERE match_id = v_match;
  UPDATE match_players SET confirm = true WHERE match_id = v_match
    AND (user_id = v_uid OR user_id IN (SELECT id FROM profiles WHERE is_ghost));
  RETURN close_confirmed_report_gk(v_match);
END $$;

-- A dispute needs the same six ballots as every other match decision.
CREATE OR REPLACE FUNCTION public.confirm_result_gk(p_ok boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_match uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.id INTO v_match FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_uid AND m.status = 'reporting' LIMIT 1 FOR UPDATE OF m;
  IF v_match IS NULL THEN RAISE EXCEPTION 'sem_resultado_para_confirmar'; END IF;
  UPDATE match_players SET confirm = p_ok WHERE match_id = v_match AND user_id = v_uid;
  IF NOT p_ok THEN
    IF (SELECT count(*) FROM match_players WHERE match_id = v_match AND confirm = false) >= 6 THEN
      UPDATE matches SET status = 'disputed' WHERE id = v_match;
      RETURN 'disputed';
    END IF;
    RETURN 'reporting';
  END IF;
  RETURN close_confirmed_report_gk(v_match);
END $$;

-- Print score and stats are written only by the server after it reads the image.
DROP FUNCTION public.set_screenshot_score_gk(uuid, integer, integer, text);
CREATE FUNCTION public.set_screenshot_score_gk(p_user uuid, p_match uuid, p_mine integer, p_theirs integer, p_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_team text; v_status text; v_by uuid; v_sa integer; v_sb integer;
BEGIN
  IF p_mine IS NULL OR p_theirs IS NULL OR p_mine < 0 OR p_theirs < 0 OR p_mine > 99 OR p_theirs > 99 THEN RAISE EXCEPTION 'placar_invalido'; END IF;
  IF p_mine = p_theirs THEN RAISE EXCEPTION 'placar_empatado'; END IF;
  SELECT status, shot_by INTO v_status, v_by FROM matches WHERE id = p_match FOR UPDATE;
  IF v_status IS NULL OR v_status = 'cancelled' THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT mp.team INTO v_team FROM match_players mp WHERE mp.match_id = p_match AND mp.user_id = p_user;
  IF v_team IS NULL THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF v_by IS NOT NULL OR v_status = 'completed' THEN RAISE EXCEPTION 'print_ja_enviado'; END IF;
  v_sa := CASE WHEN v_team = 'a' THEN p_mine ELSE p_theirs END;
  v_sb := CASE WHEN v_team = 'a' THEN p_theirs ELSE p_mine END;
  UPDATE matches SET shot_score_a = v_sa, shot_score_b = v_sb, shot_by = p_user, shot_path = p_path, shot_approved = false WHERE id = p_match;
  UPDATE match_players SET shot_vote = NULL WHERE match_id = p_match;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.set_screenshot_score_gk(uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_screenshot_score_gk(uuid, uuid, integer, integer, text) TO service_role;

DROP FUNCTION public.set_screenshot_stats_gk(uuid, jsonb);
CREATE FUNCTION public.set_screenshot_stats_gk(p_user uuid, p_match uuid, p_stats jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb; n integer := 0; v_status text; v_by uuid; v_approved boolean;
BEGIN
  SELECT status, shot_by, shot_approved INTO v_status, v_by, v_approved FROM matches WHERE id = p_match FOR UPDATE;
  IF v_by IS DISTINCT FROM p_user OR p_user IS NULL THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF v_status IN ('completed','cancelled') THEN RAISE EXCEPTION 'partida_encerrada'; END IF;
  IF v_approved THEN RAISE EXCEPTION 'print_ja_aprovado'; END IF;
  IF EXISTS (SELECT 1 FROM match_player_stats WHERE match_id = p_match) THEN RAISE EXCEPTION 'estatisticas_ja_enviadas'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM match_players WHERE match_id = p_match AND user_id = (r->>'user_id')::uuid) THEN
      INSERT INTO match_player_stats (match_id, user_id, goals, assists, passes, interceptions, saves, score, mvp)
      VALUES (p_match, (r->>'user_id')::uuid,
        greatest(0, least(50, coalesce((r->>'goals')::int, 0))),
        greatest(0, least(50, coalesce((r->>'assists')::int, 0))),
        greatest(0, least(500, coalesce((r->>'passes')::int, 0))),
        greatest(0, least(200, coalesce((r->>'interceptions')::int, 0))),
        greatest(0, least(200, coalesce((r->>'saves')::int, 0))),
        greatest(0, least(100000, coalesce((r->>'score')::int, 0))),
        coalesce((r->>'mvp')::boolean, false));
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.set_screenshot_stats_gk(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_screenshot_stats_gk(uuid, uuid, jsonb) TO service_role;

-- Authorizes and rate-limits a print read before the server spends an AI call or storage.
CREATE TABLE public.screenshot_read_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX screenshot_read_attempts_user_time_idx ON public.screenshot_read_attempts (user_id, created_at);
ALTER TABLE public.screenshot_read_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.screenshot_read_attempts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.claim_screenshot_read_gk(p_match uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_status text; v_by uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT status, shot_by INTO v_status, v_by FROM matches WHERE id = p_match;
  IF v_status IS NULL OR v_status = 'cancelled' THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF NOT EXISTS (SELECT 1 FROM match_players WHERE match_id = p_match AND user_id = v_uid AND team IS NOT NULL) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF v_by IS NOT NULL OR v_status = 'completed' THEN RAISE EXCEPTION 'print_ja_enviado'; END IF;
  -- Serializes concurrent requests so they cannot slip past the limit together.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 2));
  IF (SELECT count(*) FROM screenshot_read_attempts WHERE user_id = v_uid AND created_at > now() - interval '10 minutes') >= 5 THEN
    RAISE EXCEPTION 'muitas_tentativas';
  END IF;
  DELETE FROM screenshot_read_attempts WHERE user_id = v_uid AND created_at < now() - interval '1 day';
  INSERT INTO screenshot_read_attempts (user_id, match_id) VALUES (v_uid, p_match);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_screenshot_read_gk(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_screenshot_read_gk(uuid) TO authenticated;

-- Avatars and banners: images up to the 5MB the UI promises, no SVG (stored script), 20 new files per hour.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif','image/avif'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- A policy on storage.objects cannot query that table directly (infinite recursion).
CREATE FUNCTION public.avatar_upload_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*) < 20 FROM storage.objects
  WHERE bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND created_at > now() - interval '1 hour'
$$;
REVOKE ALL ON FUNCTION public.avatar_upload_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avatar_upload_allowed() TO authenticated;

DROP POLICY IF EXISTS "users upload own avatar" ON storage.objects;
CREATE POLICY "users upload own avatar" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.avatar_upload_allowed()
);
