-- Run in a transaction and roll back: no accounts or player statistics change.
DO $$
DECLARE ids uuid[]; mid uuid; state public.player_report_state; i integer; stage integer; rejected boolean;
BEGIN
 SELECT array_agg(id) INTO ids FROM (SELECT id FROM public.profiles WHERE NOT is_ghost ORDER BY id LIMIT 8) p;
 IF cardinality(ids)<8 THEN RAISE EXCEPTION 'Eight existing members required for transactional report test'; END IF;
 FOR stage IN 1..3 LOOP
  INSERT INTO public.matches(mode,region,status,completed_at) VALUES(5,'SA','completed',now()) RETURNING id INTO mid;
  INSERT INTO public.match_players(match_id,user_id,team,position) SELECT mid,id,'a','Ala' FROM unnest(ids) id;
  IF stage>1 THEN UPDATE public.player_report_state SET banned_until=now()-interval '1 second',eligible_since=now()-interval '1 second' WHERE target_id=ids[1]; END IF;
  FOR i IN 2..7 LOOP
   PERFORM set_config('request.jwt.claim.sub',ids[i]::text,true);
   PERFORM public.submit_player_report(mid,ids[1],'Conduta indevida na partida');
  END LOOP;
  SELECT * INTO state FROM public.player_report_state WHERE target_id=ids[1];
  IF state.strikes<>stage-1 THEN RAISE EXCEPTION 'Six reports must not ban'; END IF;
  rejected:=false;
  BEGIN PERFORM public.submit_player_report(mid,ids[1],'Tentativa repetida'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Duplicate reporter was accepted'; END IF;
  PERFORM set_config('request.jwt.claim.sub',ids[8]::text,true);
  PERFORM public.submit_player_report(mid,ids[1],'Conduta indevida na partida');
  SELECT * INTO state FROM public.player_report_state WHERE target_id=ids[1];
  IF state.strikes<>stage THEN RAISE EXCEPTION 'Seven reports must advance exactly one strike'; END IF;
  IF stage=1 AND state.banned_until<>now()+interval '1 hour' THEN RAISE EXCEPTION 'First ban must be one hour'; END IF;
  IF stage=2 AND state.banned_until<>now()+interval '6 hours' THEN RAISE EXCEPTION 'Second ban must be six hours'; END IF;
  IF stage=3 AND state.banned_until<>'infinity'::timestamptz THEN RAISE EXCEPTION 'Third ban must be permanent'; END IF;
  rejected:=false;
  BEGIN INSERT INTO public.queue(user_id,mode,region,position) VALUES(ids[1],5,'SA','Ala'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Banned player entered queue'; END IF;
 END LOOP;
END $$;