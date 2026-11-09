CREATE OR REPLACE FUNCTION public.purge_finished_bot_matches() RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_matches uuid[]; v_bots uuid[];
BEGIN
  SELECT array_agg(DISTINCT m.id) INTO v_matches FROM matches m
    JOIN match_players mp ON mp.match_id = m.id JOIN profiles p ON p.id = mp.user_id
    WHERE p.is_ghost AND m.status IN ('completed','cancelled');
  IF v_matches IS NULL THEN RETURN '{}'; END IF;
  SELECT array_agg(DISTINCT mp.user_id) INTO v_bots FROM match_players mp JOIN profiles p ON p.id = mp.user_id
    WHERE mp.match_id = ANY(v_matches) AND p.is_ghost
      AND NOT EXISTS (SELECT 1 FROM match_players o JOIN matches om ON om.id = o.match_id
        WHERE o.user_id = mp.user_id AND om.status NOT IN ('completed','cancelled'));
  v_bots := coalesce(v_bots, '{}');
  DELETE FROM match_player_stats WHERE match_id = ANY(v_matches) OR user_id = ANY(v_bots);
  DELETE FROM player_likes WHERE match_id = ANY(v_matches) OR giver_id = ANY(v_bots) OR target_id = ANY(v_bots);
  DELETE FROM player_reports WHERE match_id = ANY(v_matches) OR reporter_id = ANY(v_bots) OR target_id = ANY(v_bots);
  DELETE FROM point_protection_events WHERE match_id = ANY(v_matches) OR user_id = ANY(v_bots);
  DELETE FROM rank_history WHERE match_id = ANY(v_matches) OR user_id = ANY(v_bots);
  DELETE FROM rating_history WHERE match_id = ANY(v_matches) OR user_id = ANY(v_bots);
  DELETE FROM match_voice WHERE match_id = ANY(v_matches);
  DELETE FROM mod_actions WHERE target_match = ANY(v_matches) OR target_user = ANY(v_bots);
  DELETE FROM match_players WHERE match_id = ANY(v_matches);
  DELETE FROM matches WHERE id = ANY(v_matches);
  DELETE FROM queue WHERE user_id = ANY(v_bots);
  DELETE FROM player_report_state WHERE target_id = ANY(v_bots);
  DELETE FROM point_protection_wallets WHERE user_id = ANY(v_bots);
  DELETE FROM coin_wallets WHERE user_id = ANY(v_bots);
  DELETE FROM shop_purchases WHERE user_id = ANY(v_bots);
  DELETE FROM avatar_frames WHERE user_id = ANY(v_bots);
  DELETE FROM avatar_frame_access WHERE user_id = ANY(v_bots);
  DELETE FROM discord_links WHERE user_id = ANY(v_bots);
  DELETE FROM user_roles WHERE user_id = ANY(v_bots);
  DELETE FROM profiles WHERE id = ANY(v_bots) AND is_ghost;
  RETURN v_bots;
END $f$;
REVOKE EXECUTE ON FUNCTION public.purge_finished_bot_matches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_finished_bot_matches() TO service_role;