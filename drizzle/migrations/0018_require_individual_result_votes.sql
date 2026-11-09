CREATE OR REPLACE FUNCTION public.ghost_vote_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN RETURN NULL; END; $$;
COMMENT ON FUNCTION public.ghost_vote_trg() IS 'DEPRECATED: bots must not copy participant votes; each result vote is individual.';
CREATE OR REPLACE FUNCTION public.join_queue_gk(p_position text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
IF p_position IS NULL OR p_position NOT IN ('Goleiro','Pivô','Ala','Fixo') THEN RAISE EXCEPTION 'invalid_position'; END IF;
IF EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND banned_until>now()) THEN RAISE EXCEPTION 'jogador_suspenso'; END IF;
IF EXISTS (SELECT 1 FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id WHERE mp.user_id=auth.uid() AND m.status IN ('ready','lobby','draft','room','voting','reporting','disputed')) THEN RAISE EXCEPTION 'finalize_partida_atual'; END IF;
DELETE FROM public.queue WHERE user_id=auth.uid();
INSERT INTO public.queue(user_id,mode,region,position) VALUES(auth.uid(),5,'SA',p_position);
PERFORM public.try_matchmake_gk(); RETURN true; END; $$;
CREATE OR REPLACE FUNCTION public.leave_queue_gk() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
IF EXISTS (SELECT 1 FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id WHERE mp.user_id=auth.uid() AND m.status IN ('ready','lobby','draft','room','voting','reporting','disputed')) THEN RAISE EXCEPTION 'finalize_partida_atual'; END IF;
DELETE FROM public.queue WHERE user_id=auth.uid(); RETURN true; END; $$;