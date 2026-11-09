CREATE OR REPLACE FUNCTION public.draft_pick(p_target uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_match uuid; v_turn text; v_cap uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.id INTO v_match FROM public.match_players mp JOIN public.matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_uid AND m.status = 'draft' ORDER BY m.created_at DESC LIMIT 1;
  IF v_match IS NULL THEN RAISE EXCEPTION 'sem_partida_em_escolha'; END IF;
  PERFORM public.draft_tick(v_match);
  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = v_match AND status = 'draft') THEN RETURN true; END IF;
  v_turn := public.draft_turn(v_match);
  SELECT CASE WHEN v_turn = 'a' THEN captain_a ELSE captain_b END INTO v_cap FROM public.matches WHERE id = v_match;
  IF v_cap IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'nao_e_sua_vez'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.match_players WHERE match_id = v_match AND user_id = p_target AND team IS NULL) THEN
    RAISE EXCEPTION 'jogador_indisponivel';
  END IF;
  IF NOT public.draft_target_ok(v_match, p_target) THEN
    IF public.draft_phase(v_match) = 'line' THEN RAISE EXCEPTION 'escolha_linha'; END IF;
    RAISE EXCEPTION 'escolha_goleiro';
  END IF;
  PERFORM public.draft_assign(v_match, p_target);
  PERFORM public.ghost_autopick(v_match);
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.draft_tick(p_match uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_target uuid;
BEGIN
  PERFORM 1 FROM public.matches WHERE id = p_match AND status = 'draft' AND deadline < now() FOR UPDATE;
  IF FOUND THEN
    SELECT user_id INTO v_target FROM public.match_players
     WHERE match_id = p_match AND team IS NULL AND public.draft_target_ok(p_match, user_id)
     ORDER BY random() LIMIT 1;
    IF v_target IS NOT NULL THEN PERFORM public.draft_assign(p_match, v_target); END IF;
  END IF;
  PERFORM public.ghost_autopick(p_match);
END $function$;

CREATE OR REPLACE FUNCTION public.ghost_autopick(p_match uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_turn text; v_cap uuid; v_target uuid;
BEGIN
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.match_players WHERE match_id = p_match AND team IS NULL);
    v_turn := public.draft_turn(p_match);
    EXIT WHEN v_turn IS NULL;
    SELECT CASE WHEN v_turn = 'a' THEN captain_a ELSE captain_b END INTO v_cap FROM public.matches WHERE id = p_match;
    EXIT WHEN v_cap IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_cap AND is_ghost);
    SELECT user_id INTO v_target FROM public.match_players
     WHERE match_id = p_match AND team IS NULL AND public.draft_target_ok(p_match, user_id)
     ORDER BY rating_before DESC LIMIT 1;
    EXIT WHEN v_target IS NULL;
    PERFORM public.draft_assign(p_match, v_target);
  END LOOP;
END $function$;