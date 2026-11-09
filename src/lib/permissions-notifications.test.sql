-- Entire test is rolled back; no permissions, notifications, likes or grants persist.
BEGIN;
CREATE TEMP TABLE t_ctx ON COMMIT DROP AS
SELECT (SELECT p.id FROM public.profiles p WHERE NOT p.is_ghost
          AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
          ORDER BY p.created_at LIMIT 1) AS player,
       'd4ccb4bb-978c-4205-9a36-8a5880bf069f'::uuid AS admin;
-- A match whose teams are set but voting is still open: two teammates.
CREATE TEMP TABLE t_match ON COMMIT DROP AS
SELECT a.match_id, a.user_id AS giver, b.user_id AS target
FROM public.match_players a JOIN public.match_players b ON b.match_id = a.match_id AND lower(b.team) = lower(a.team) AND b.user_id <> a.user_id
JOIN public.matches m ON m.id = a.match_id
JOIN public.profiles pa ON pa.id = a.user_id AND NOT pa.is_ghost
JOIN public.profiles pb ON pb.id = b.user_id AND NOT pb.is_ghost
WHERE m.status = 'completed' AND NOT EXISTS (SELECT 1 FROM public.player_likes l WHERE l.giver_id = a.user_id AND l.target_id = b.user_id)
LIMIT 1;
UPDATE public.matches SET status = 'voting' WHERE id = (SELECT match_id FROM t_match);
GRANT SELECT ON t_ctx, t_match TO authenticated;

SET LOCAL ROLE authenticated;
DO $$
DECLARE v_player uuid; v_admin uuid; v_tag uuid; n int; ok boolean;
BEGIN
  SELECT player, admin INTO v_player, v_admin FROM t_ctx;
  -- Player without permission cannot set a banner or buy.
  PERFORM set_config('request.jwt.claim.sub', v_player::text, true);
  IF public.has_feature(v_player, 'banner') THEN RAISE EXCEPTION 'player should not start with banner'; END IF;
  BEGIN UPDATE public.profiles SET banner_url = v_player::text || '/banner-x.png' WHERE id = v_player; RAISE EXCEPTION 'banner allowed without permission';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'banner allowed without permission' THEN RAISE; END IF; END;
  BEGIN PERFORM public.buy_shop_item('x'); RAISE EXCEPTION 'shop allowed without permission';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'sem_permissao' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_set_feature(v_player, 'banner', true); RAISE EXCEPTION 'non-admin granted a feature';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'sem_permissao' THEN RAISE; END IF; END;

  -- Admin grants banner, coins and a tag; each creates a notification.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  IF NOT public.admin_set_feature(v_player, 'banner', true) THEN RAISE EXCEPTION 'grant failed'; END IF;
  PERFORM public.admin_grant_inventory(v_player, 'coins', 50, NULL, 'teste notificação', gen_random_uuid());
  SELECT id INTO v_tag FROM public.profile_tags WHERE effect = 'glow-green' LIMIT 1;
  IF v_tag IS NULL THEN RAISE EXCEPTION 'glowing supporter tag missing'; END IF;
  PERFORM public.admin_grant_profile_tag(v_tag, ARRAY[v_player], false);

  -- Player now has banner permission, sees exactly their notifications.
  PERFORM set_config('request.jwt.claim.sub', v_player::text, true);
  IF NOT public.has_feature(v_player, 'banner') THEN RAISE EXCEPTION 'banner permission not effective'; END IF;
  UPDATE public.profiles SET banner_url = v_player::text || '/banner-x.png' WHERE id = v_player;
  SELECT count(*) INTO n FROM public.user_notifications WHERE kind IN ('feature','coins','tag') AND created_at >= now();
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 notifications, got %', n; END IF;
  IF public.mark_notifications_read() < 3 THEN RAISE EXCEPTION 'mark read failed'; END IF;

  -- Another player cannot read those notifications.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SELECT count(*) INTO n FROM public.user_notifications WHERE user_id = v_player;
  IF n <> 0 THEN RAISE EXCEPTION 'notifications leaked to another account'; END IF;

  -- Likes work while the match is still in its result vote.
  IF EXISTS (SELECT 1 FROM t_match) THEN
    PERFORM set_config('request.jwt.claim.sub', (SELECT giver::text FROM t_match), true);
    SELECT public.like_player((SELECT match_id FROM t_match), (SELECT target FROM t_match)) INTO ok;
    IF NOT ok THEN RAISE EXCEPTION 'like during voting failed'; END IF;
    IF NOT (SELECT target FROM t_match) = ANY(public.get_my_liked_ids()) THEN RAISE EXCEPTION 'liked id not read back'; END IF;
  END IF;
  RAISE NOTICE 'permissions/notifications/likes test passed';
END $$;
ROLLBACK;
