-- Every title granted while a season is active belongs to that season, whatever path grants it.
CREATE OR REPLACE FUNCTION public.profile_tag_default_season() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.season_id IS NULL THEN
    NEW.season_id := (SELECT id FROM public.seasons WHERE status = 'active' AND started_at <= coalesce(NEW.granted_at, now()) LIMIT 1);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.profile_tag_default_season() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profile_tag_default_season ON public.player_profile_tags;
CREATE TRIGGER profile_tag_default_season BEFORE INSERT ON public.player_profile_tags
FOR EACH ROW EXECUTE FUNCTION public.profile_tag_default_season();

-- Titles already sent during the active season join it now instead of waiting for finalization.
UPDATE public.player_profile_tags pt SET season_id = s.id
FROM public.seasons s
WHERE s.status = 'active' AND pt.season_id IS NULL AND pt.granted_at >= s.started_at;