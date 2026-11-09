-- Finishing a season freezes it and immediately starts the next number, counting from now.
CREATE OR REPLACE FUNCTION public.admin_finish_season(p_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_start timestamptz; v_number int; v_end timestamptz := now(); n integer; v_next uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('season_state'));
  SELECT status, started_at, number INTO v_status, v_start, v_number FROM public.seasons WHERE id = p_id FOR UPDATE;
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
  UPDATE public.player_profile_tags SET season_id = p_id WHERE season_id IS NULL AND granted_at >= v_start AND granted_at <= v_end;
  UPDATE public.seasons SET status = 'finished', finished_at = v_end WHERE id = p_id;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'season_finished', p_id::text||': '||n||' jogadores');

  -- Next season: reuse a planned one with the next number, otherwise create it.
  SELECT id INTO v_next FROM public.seasons WHERE number = v_number + 1 AND status = 'planned';
  IF v_next IS NULL THEN
    INSERT INTO public.seasons(number, name, created_by)
    VALUES ((SELECT max(number) + 1 FROM public.seasons), 'Season '||(SELECT max(number) + 1 FROM public.seasons), auth.uid())
    RETURNING id INTO v_next;
  END IF;
  PERFORM public.admin_start_season(v_next, false);
  RETURN n;
END $$;