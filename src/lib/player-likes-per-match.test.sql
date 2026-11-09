-- Rule: a player can like the same teammate again in a NEW match, but only once per match.
-- Entire test is rolled back; nothing persists.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '8811c9a6-51ca-4672-9ad7-84367d3f818e', true);
DO $$
DECLARE before_count int;
BEGIN
  -- oJhin already liked MH in match e48c3287…; both are teammates again in match 46996d7e…
  IF NOT EXISTS (SELECT 1 FROM public.player_likes WHERE giver_id = '8811c9a6-51ca-4672-9ad7-84367d3f818e'
      AND target_id = '0bd6125a-03a2-4d8e-acc7-164eb69f869b' AND match_id = 'e48c3287-463a-4596-9914-5e1abc83f116') THEN
    RAISE EXCEPTION 'Fixture missing: earlier like';
  END IF;
  SELECT public.player_reputation('0bd6125a-03a2-4d8e-acc7-164eb69f869b') INTO before_count;
  IF NOT public.like_player('46996d7e-ed8b-4181-b5f1-1daeef62435c', '0bd6125a-03a2-4d8e-acc7-164eb69f869b') THEN
    RAISE EXCEPTION 'Like in a new match was blocked';
  END IF;
  IF public.player_reputation('0bd6125a-03a2-4d8e-acc7-164eb69f869b') <> before_count + 1 THEN
    RAISE EXCEPTION 'New-match like did not add exactly one';
  END IF;
  IF public.like_player('46996d7e-ed8b-4181-b5f1-1daeef62435c', '0bd6125a-03a2-4d8e-acc7-164eb69f869b') THEN
    RAISE EXCEPTION 'Second like in the same match was accepted';
  END IF;
  IF NOT ('0bd6125a-03a2-4d8e-acc7-164eb69f869b' = ANY(public.get_my_match_liked_ids('46996d7e-ed8b-4181-b5f1-1daeef62435c'))) THEN
    RAISE EXCEPTION 'Per-match liked ids missing the new like';
  END IF;
  RAISE NOTICE 'PASS: new-match like allowed, same-match duplicate blocked';
END $$;
ROLLBACK;
