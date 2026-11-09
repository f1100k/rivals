-- Execute inside BEGIN / ROLLBACK, preserving every account and statistic.
DO $$
DECLARE ids uuid[]; mid uuid; i integer; rejected boolean; baseline jsonb; after_stats jsonb;
BEGIN
 SELECT id INTO mid FROM public.matches WHERE room_code='CANCEL-TEST-ROOM';
 SELECT array_agg(user_id ORDER BY user_id) INTO ids FROM public.match_players WHERE match_id=mid;
 IF cardinality(ids)<>10 THEN RAISE EXCEPTION 'Ten-participant draft test fixture required'; END IF;
 SELECT jsonb_agg(jsonb_build_array(id,rating,wins,losses) ORDER BY id) INTO baseline FROM public.profiles WHERE id=ANY(ids);
 PERFORM set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.match_players WHERE match_id=(SELECT id FROM public.matches WHERE room_code='CANCEL-TEST-DRAFT') LIMIT 1),true);
 rejected:=false;
 BEGIN PERFORM public.abandon_match_gk(); EXCEPTION WHEN OTHERS THEN IF SQLERRM='aguarde_fim_draft' THEN rejected:=true; ELSE RAISE; END IF; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cancellation during draft accepted'; END IF;
 SELECT id INTO mid FROM public.matches WHERE room_code='CANCEL-TEST-ROOM';
 FOR i IN 1..5 LOOP
  PERFORM set_config('request.jwt.claim.sub',ids[i]::text,true);
  PERFORM public.vote_cancel_match_gk();
 END LOOP;
 IF (SELECT status FROM public.matches WHERE id=mid)<>'room' THEN RAISE EXCEPTION 'Five votes cancelled match'; END IF;
 rejected:=false;
 BEGIN PERFORM public.vote_cancel_match_gk(); EXCEPTION WHEN OTHERS THEN IF SQLERRM='ja_votou_cancelar' THEN rejected:=true; ELSE RAISE; END IF; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Duplicate cancellation vote accepted'; END IF;
 PERFORM set_config('request.jwt.claim.sub',ids[6]::text,true);
 IF public.vote_cancel_match_gk()<>'cancelled' THEN RAISE EXCEPTION 'Six votes did not cancel'; END IF;
 IF (SELECT count(*) FROM public.match_players WHERE match_id=mid)<>10 THEN RAISE EXCEPTION 'Cancellation deleted participants'; END IF;
 SELECT jsonb_agg(jsonb_build_array(id,rating,wins,losses) ORDER BY id) INTO after_stats FROM public.profiles WHERE id=ANY(ids);
 IF baseline IS DISTINCT FROM after_stats THEN RAISE EXCEPTION 'Cancellation changed statistics'; END IF;
 IF public.vote_winner_gk(5,4) IS NOT NULL OR public.vote_winner_gk(6,4)<>'a' OR public.vote_winner_gk(4,6)<>'b' THEN RAISE EXCEPTION 'Winner requires six votes for same team'; END IF;
 rejected:=false;
 BEGIN PERFORM public.finalize_match_gk(mid,6,0); EXCEPTION WHEN OTHERS THEN IF SQLERRM='partida_ja_finalizada' THEN rejected:=true; ELSE RAISE; END IF; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cancelled match received a result'; END IF;
 SELECT jsonb_agg(jsonb_build_array(id,rating,wins,losses) ORDER BY id) INTO after_stats FROM public.profiles WHERE id=ANY(ids);
 IF baseline IS DISTINCT FROM after_stats THEN RAISE EXCEPTION 'Repeated finalization changed Elo'; END IF;
END $$;