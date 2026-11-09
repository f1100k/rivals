-- Entire test is rolled back; no likes or reputation changes persist.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd4ccb4bb-978c-4205-9a36-8a5880bf069f', true);
DO $$
DECLARE before_count int; after_count int; did_insert boolean;
BEGIN
  SELECT public.player_reputation('0dafabee-c5f8-4b76-a7fb-45d0de5882ab') INTO before_count;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.get_my_like_matches()) m
    WHERE m->>'id' = '684f060a-a703-47a7-aa09-b8b03860c442'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(m->'players') p WHERE p->>'userId' = '0dafabee-c5f8-4b76-a7fb-45d0de5882ab')) THEN
    RAISE EXCEPTION 'Completed-match teammate missing from like read';
  END IF;
  SELECT public.like_player('684f060a-a703-47a7-aa09-b8b03860c442', '0dafabee-c5f8-4b76-a7fb-45d0de5882ab') INTO did_insert;
  IF NOT did_insert THEN RAISE EXCEPTION 'First eligible like did not insert'; END IF;
  SELECT public.player_reputation('0dafabee-c5f8-4b76-a7fb-45d0de5882ab') INTO after_count;
  IF after_count <> before_count + 1 THEN RAISE EXCEPTION 'Like did not increase reputation by exactly one'; END IF;
  IF public.like_player('684f060a-a703-47a7-aa09-b8b03860c442', '0dafabee-c5f8-4b76-a7fb-45d0de5882ab') THEN
    RAISE EXCEPTION 'Duplicate like inserted';
  END IF;
  IF public.player_reputation('0dafabee-c5f8-4b76-a7fb-45d0de5882ab') <> after_count THEN
    RAISE EXCEPTION 'Duplicate changed reputation';
  END IF;
  RAISE NOTICE 'PASS: eligible like persists within transaction, reputation +1, duplicate prevented';
END $$;
ROLLBACK;