select 'five_votes_do_not_finalize' as rule, public.vote_winner_gk(5,4) is null as passed
union all select 'six_a_votes_win', public.vote_winner_gk(6,4) = 'a'
union all select 'six_b_votes_win', public.vote_winner_gk(4,6) = 'b'
union all select 'five_five_does_not_finalize', public.vote_winner_gk(5,5) is null
union all select 'one_vote_does_not_finalize', public.vote_winner_gk(1,0) is null
union all select 'bots_do_not_copy_votes', exists (
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='ghost_vote_trg'
 and pg_get_functiondef(p.oid) not ilike '%update%match_players%'
)
union all select 'joining_blocked_during_match', exists (
 select 1 from pg_proc where proname='join_queue_gk'
 and pg_get_functiondef(oid) like '%RAISE EXCEPTION ''finalize_partida_atual''%'
)
union all select 'leaving_blocked_during_match', exists (
 select 1 from pg_proc where proname='leave_queue_gk'
 and pg_get_functiondef(oid) like '%RAISE EXCEPTION ''finalize_partida_atual''%'
)
union all select 'central_finalization', exists (
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='vote_result_gk'
 and pg_get_functiondef(p.oid) like '%PERFORM public.finalize_match_gk(v_match,v_sa,v_sb)%'
 and pg_get_functiondef(p.oid) like '%FOR UPDATE OF m%'
)
union all select 'six_votes_without_print_wait_for_screenshot', exists (
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='vote_result_gk'
 and pg_get_functiondef(p.oid) like '%awaiting_screenshot%'
 and pg_get_functiondef(p.oid) like '%status=''reporting''%'
)
union all select 'screenshot_save_closes_decided_match', exists (
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='set_screenshot_score_gk'
 and pg_get_functiondef(p.oid) like '%PERFORM public.finalize_match_gk(p_match, v_sa, v_sb)%'
 and pg_get_functiondef(p.oid) like '%placar_diferente_da_votacao%'
);