CREATE TABLE public.mix_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  manual_on boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mix_settings_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
GRANT SELECT ON public.mix_settings TO anon, authenticated;
GRANT ALL ON public.mix_settings TO service_role;
ALTER TABLE public.mix_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mix settings readable" ON public.mix_settings FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.mix_settings(id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_mix boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS matches_mix_completed_idx ON public.matches (completed_at) WHERE is_mix AND status = 'completed';

CREATE OR REPLACE FUNCTION public.mix_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT manual_on OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND now() >= starts_at AND now() < ends_at)
    FROM public.mix_settings WHERE id), false);
$$;

CREATE OR REPLACE FUNCTION public.get_mix_state() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('active', public.mix_active(), 'manualOn', coalesce(s.manual_on, false),
    'startsAt', s.starts_at, 'endsAt', s.ends_at)
  FROM (SELECT * FROM public.mix_settings WHERE id) s
  RIGHT JOIN (SELECT 1) x ON true;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_mix(p_manual_on boolean, p_starts timestamptz, p_ends timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF (p_starts IS NULL) <> (p_ends IS NULL) THEN RAISE EXCEPTION 'horario_incompleto'; END IF;
  IF p_starts IS NOT NULL AND p_ends <= p_starts THEN RAISE EXCEPTION 'fim_antes_do_inicio'; END IF;
  INSERT INTO public.mix_settings(id, manual_on, starts_at, ends_at, updated_by, updated_at)
    VALUES (true, coalesce(p_manual_on, false), p_starts, p_ends, auth.uid(), now())
    ON CONFLICT (id) DO UPDATE SET manual_on = EXCLUDED.manual_on, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'mix_configurado',
    CASE WHEN p_manual_on THEN 'Mix ligado manualmente' WHEN p_starts IS NOT NULL THEN 'Mix programado: ' || to_char(p_starts AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || ' até ' || to_char(p_ends AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') ELSE 'Mix desligado' END);
  RETURN public.get_mix_state();
END $$;

-- Mix: captains stay the two highest MMR; each side gets one keeper; the remaining
-- players are paired by MMR and each pair is split between the teams by coin flip.
CREATE OR REPLACE FUNCTION public.mix_assign_teams_gk(p_match uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_side text; v_a int; v_b int; v_gka int; v_gkb int; v_pair uuid[] := '{}'; v_first text;
BEGIN
  PERFORM 1 FROM public.matches WHERE id = p_match AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.matches SET is_mix = true WHERE id = p_match;
  FOR r IN SELECT user_id FROM public.match_players WHERE match_id = p_match AND team IS NULL AND position = 'Goleiro' ORDER BY random() LOOP
    SELECT count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b'),
           count(*) FILTER (WHERE team = 'a' AND position = 'Goleiro'), count(*) FILTER (WHERE team = 'b' AND position = 'Goleiro')
      INTO v_a, v_b, v_gka, v_gkb FROM public.match_players WHERE match_id = p_match;
    v_side := CASE WHEN v_gka = 0 AND v_gkb = 0 THEN (CASE WHEN random() < 0.5 THEN 'a' ELSE 'b' END)
                   WHEN v_gka = 0 AND v_a < 5 THEN 'a' WHEN v_gkb = 0 AND v_b < 5 THEN 'b'
                   WHEN v_a <= v_b THEN 'a' ELSE 'b' END;
    UPDATE public.match_players SET team = v_side WHERE match_id = p_match AND user_id = r.user_id;
  END LOOP;
  FOR r IN SELECT user_id FROM public.match_players WHERE match_id = p_match AND team IS NULL ORDER BY rating_before DESC, random() LOOP
    v_pair := v_pair || r.user_id;
    IF cardinality(v_pair) = 2 THEN
      SELECT count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b') INTO v_a, v_b FROM public.match_players WHERE match_id = p_match;
      IF v_a < 5 AND v_b < 5 THEN
        v_first := CASE WHEN random() < 0.5 THEN 'a' ELSE 'b' END;
        UPDATE public.match_players SET team = v_first WHERE match_id = p_match AND user_id = v_pair[1];
        UPDATE public.match_players SET team = CASE WHEN v_first = 'a' THEN 'b' ELSE 'a' END WHERE match_id = p_match AND user_id = v_pair[2];
      ELSE
        UPDATE public.match_players SET team = CASE WHEN v_a < 5 THEN 'a' ELSE 'b' END WHERE match_id = p_match AND user_id = ANY(v_pair);
      END IF;
      v_pair := '{}';
    END IF;
  END LOOP;
  IF cardinality(v_pair) = 1 THEN
    SELECT count(*) FILTER (WHERE team = 'a'), count(*) FILTER (WHERE team = 'b') INTO v_a, v_b FROM public.match_players WHERE match_id = p_match;
    UPDATE public.match_players SET team = CASE WHEN v_a <= v_b THEN 'a' ELSE 'b' END WHERE match_id = p_match AND user_id = v_pair[1];
  END IF;
  UPDATE public.matches SET status = 'room', deadline = NULL, draft_pool = 0 WHERE id = p_match AND status = 'draft';
END $$;

CREATE OR REPLACE FUNCTION public.get_mix_ranking() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.balance DESC, x.wins DESC, x.losses, x.name), '[]'::jsonb) FROM (
    SELECT p.id, p.name, p.avatar_url, p.rating,
      count(*) FILTER (WHERE mp.team = CASE WHEN m.score_a > m.score_b THEN 'a' ELSE 'b' END)::int AS wins,
      count(*) FILTER (WHERE mp.team <> CASE WHEN m.score_a > m.score_b THEN 'a' ELSE 'b' END)::int AS losses,
      (count(*) FILTER (WHERE mp.team = CASE WHEN m.score_a > m.score_b THEN 'a' ELSE 'b' END)
       - count(*) FILTER (WHERE mp.team <> CASE WHEN m.score_a > m.score_b THEN 'a' ELSE 'b' END))::int AS balance
    FROM public.matches m
    JOIN public.match_players mp ON mp.match_id = m.id AND mp.team IS NOT NULL
    JOIN public.profiles p ON p.id = mp.user_id AND NOT p.is_ghost
    WHERE m.is_mix AND m.status = 'completed' AND m.region <> 'TESTE' AND NOT m.had_bots
      AND m.score_a IS NOT NULL AND m.score_b IS NOT NULL AND m.score_a <> m.score_b
    GROUP BY p.id, p.name, p.avatar_url, p.rating
    LIMIT 200
  ) x;
$$;

REVOKE ALL ON FUNCTION public.mix_assign_teams_gk(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_mix(boolean, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_mix(boolean, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mix_active() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mix_state() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mix_ranking() TO anon, authenticated, service_role;

DO $mixpatch$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.finalize_match_gk(uuid,integer,integer)'::regprocedure);
  n := replace(d, '(region = ''TESTE'' OR had_bots)) INTO bot_match', '(region = ''TESTE'' OR had_bots OR is_mix)) INTO bot_match');
  IF n = d THEN RAISE EXCEPTION 'finalize_match_gk: trecho esperado nao encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.try_matchmake_pool_gk(boolean)'::regprocedure);
  n := regexp_replace(d, 'WHERE id = v_match;\s*END \$function\$\s*$', E'WHERE id = v_match;\n  IF public.mix_active() THEN PERFORM public.mix_assign_teams_gk(v_match); END IF;\nEND $function$\n');
  IF n = d THEN RAISE EXCEPTION 'try_matchmake_pool_gk: trecho esperado nao encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.admin_void_match(uuid,text)'::regprocedure);
  n := replace(d, 'FROM public.match_players WHERE match_id = p_match ORDER BY user_id LOOP',
    'FROM public.match_players WHERE match_id = p_match AND NOT coalesce((SELECT m.is_mix FROM public.matches m WHERE m.id = p_match), false) ORDER BY user_id LOOP');
  IF n = d THEN RAISE EXCEPTION 'admin_void_match: trecho esperado nao encontrado'; END IF;
  EXECUTE n;
END $mixpatch$;