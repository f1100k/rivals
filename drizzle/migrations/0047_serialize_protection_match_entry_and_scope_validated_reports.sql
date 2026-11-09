CREATE OR REPLACE FUNCTION public.lock_competitive_match_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM pg_advisory_xact_lock(52719,5); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.lock_competitive_match_entry() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER serialize_competitive_match_entry BEFORE INSERT ON public.match_players FOR EACH ROW EXECUTE FUNCTION public.lock_competitive_match_entry();
-- Scope seven concordances to one match, never combine unrelated accusations.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.submit_player_report(uuid,uuid,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'WHERE target_id=p_target AND cycle=s.cycle AND NOT dismissed;','WHERE target_id=p_target AND match_id=p_match AND cycle=s.cycle AND NOT dismissed;');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.review_player_report(uuid,uuid,text,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'WHERE target_id=p_target AND cycle=s.cycle AND confirmed AND NOT dismissed;','WHERE target_id=p_target AND match_id=match_id_to_penalize AND cycle=s.cycle AND confirmed AND NOT dismissed;');
 EXECUTE definition;
END $$;