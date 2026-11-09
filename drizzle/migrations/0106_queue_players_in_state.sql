CREATE OR REPLACE FUNCTION public.get_inhouse_state_gk()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_me json; v_queue json; v_counts json; v_match json; v_last json; v_queue_players json := '[]'::json; v_test boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT (to_jsonb(p) || jsonb_build_object('isStaff', public.is_staff(v_uid)))::json INTO v_me FROM profiles p WHERE p.id = v_uid;
  SELECT to_jsonb(q)::json INTO v_queue FROM queue q WHERE q.user_id = v_uid;
  v_test := coalesce((SELECT q2.region = 'TESTE' FROM queue q2 WHERE q2.user_id = v_uid), false);
  SELECT json_build_object('total', count(*), 'goalkeepers', count(*) FILTER(WHERE position = 'Goleiro'), 'outfield', count(*) FILTER(WHERE position IS NOT NULL AND position <> 'Goleiro')) INTO v_counts FROM queue WHERE position IS NOT NULL AND (region = 'TESTE') = v_test;
  -- Who is waiting in the same pool, shown only to people who are themselves queued.
  IF v_queue IS NOT NULL THEN
    SELECT coalesce(json_agg(json_build_object('userId', q.user_id, 'name', pr.name, 'avatarUrl', pr.avatar_url, 'rating', pr.rating,
      'position', q.position, 'joinedAt', q.joined_at, 'isMe', q.user_id = v_uid) ORDER BY q.joined_at), '[]'::json)
      INTO v_queue_players
    FROM (SELECT * FROM queue WHERE position IS NOT NULL AND (region = 'TESTE') = v_test ORDER BY joined_at LIMIT 30) q
    JOIN profiles pr ON pr.id = q.user_id;
  END IF;
  SELECT to_jsonb(x)::json INTO v_match FROM (
    SELECT m.id, m.status, m.room_code AS "roomCode", m.created_at AS "createdAt", m.report_a AS "reportA", m.report_b AS "reportB",
      (SELECT name FROM profiles WHERE id = m.reported_by) AS "reportedBy",
      m.captain_a AS "captainA", m.captain_b AS "captainB",
      coalesce(json_agg(json_build_object('userId', mp.user_id, 'name', pr.name, 'avatarUrl', pr.avatar_url, 'rating', mp.rating_before,
        'position', mp.position, 'primaryPosition', pr.primary_position, 'secondaryPosition', pr.secondary_position,
        'team', mp.team, 'vote', mp.vote, 'cancelVote', mp.cancel_vote, 'confirm', mp.confirm, 'isMe', mp.user_id = v_uid,
        'isCaptain', mp.user_id IN (m.captain_a, m.captain_b))
        ORDER BY (mp.user_id IN (m.captain_a, m.captain_b)) DESC, mp.team NULLS LAST, (mp.position = 'Goleiro') DESC, mp.rating_before DESC), '[]'::json) AS players
    FROM matches m JOIN match_players mp ON mp.match_id = m.id JOIN profiles pr ON pr.id = mp.user_id
    WHERE m.status IN ('draft','room','voting','reporting','disputed') AND EXISTS(SELECT 1 FROM match_players mine WHERE mine.match_id = m.id AND mine.user_id = v_uid)
    GROUP BY m.id) x;
  SELECT to_jsonb(h)::json INTO v_last FROM (
    SELECT m.score_a AS "scoreA", m.score_b AS "scoreB", m.completed_at AS "completedAt",
      json_agg(json_build_object('name', pr.name, 'team', mp.team, 'delta', mp.delta,
        'elo', rh.elo_delta, 'bonus', rh.streak_bonus, 'before', rh.rating_before, 'after', rh.rating_after)
        ORDER BY mp.team, mp.rating_before DESC) AS players
    FROM matches m JOIN match_players mp ON mp.match_id = m.id JOIN profiles pr ON pr.id = mp.user_id
    LEFT JOIN public.rating_history rh ON rh.match_id = m.id AND rh.user_id = mp.user_id
    WHERE m.status = 'completed' AND EXISTS(SELECT 1 FROM match_players mine WHERE mine.match_id = m.id AND mine.user_id = v_uid)
    GROUP BY m.id ORDER BY m.completed_at DESC LIMIT 1) h;
  RETURN json_build_object('me', v_me, 'queue', v_queue, 'counts', v_counts, 'queuePlayers', v_queue_players, 'testMode', v_test OR coalesce((SELECT m.region = 'TESTE' FROM matches m JOIN match_players mp ON mp.match_id = m.id WHERE mp.user_id = v_uid AND m.status IN ('draft','room','voting','reporting','disputed') LIMIT 1), false), 'match', v_match, 'lastResult', v_last);
END $function$;