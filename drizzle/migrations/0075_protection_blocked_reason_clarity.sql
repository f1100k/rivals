CREATE OR REPLACE FUNCTION public.get_point_protection_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE u uuid:=auth.uid(); result jsonb; w point_protection_wallets;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 PERFORM public.lock_competitive_player(u);
 PERFORM refresh_point_wallet(u);
 SELECT * INTO w FROM point_protection_wallets WHERE user_id=u;
 SELECT jsonb_build_object('matchId',m.id,'completedAt',m.completed_at,'before',mp.rating_after-mp.delta,'after',mp.rating_after,'baseDelta',mp.base_delta,'delta',mp.delta,'averageA',m.average_a,'averageB',m.average_b,'protectionKind',mp.protection_kind,'trollingDelta',mp.trolling_delta,'blockedReason',CASE
 WHEN mp.base_delta>0 THEN 'Você venceu esta partida: não há pontos a proteger.'
 WHEN mp.base_delta=0 AND ((mp.team='a' AND m.score_a>m.score_b) OR (mp.team='b' AND m.score_b>m.score_a)) THEN 'Você venceu sem ganho de MMR: não há pontos a proteger.'
 WHEN mp.base_delta=0 THEN 'Esta derrota não descontou pontos, então não há o que proteger.'
 WHEN mp.trolling_delta<>0 THEN 'Trollagem confirmada: proteção bloqueada.'
 WHEN mp.protection_kind IS NOT NULL THEN 'Proteção já utilizada nesta partida.'
 WHEN EXISTS(SELECT 1 FROM player_reports WHERE target_id=u AND match_id=m.id AND NOT dismissed AND verdict IS NULL) THEN 'Aguardando veredito das denúncias desta partida.'
 WHEN EXISTS(SELECT 1 FROM match_players next_mp JOIN matches next_m ON next_m.id=next_mp.match_id WHERE next_mp.user_id=u AND next_m.id<>m.id AND (next_m.created_at>=m.completed_at OR next_m.status IN ('draft','room','voting','reporting','disputed','ready','lobby'))) THEN 'Proteção expirada: outra partida já começou.'
 ELSE NULL END) INTO result FROM match_players mp JOIN matches m ON m.id=mp.match_id WHERE mp.user_id=u AND mp.competitive AND m.status='completed' ORDER BY m.completed_at DESC,m.id DESC LIMIT 1;
 RETURN jsonb_build_object('dailyAvailable',w.daily_available,'dailyNextAt',w.daily_next_at,'rankStock',w.rank_stock,'result',result,'history',coalesce((SELECT jsonb_agg(x ORDER BY x."createdAt" DESC) FROM (SELECT event,category,points,stock_change AS "stockChange",match_id AS "matchId",created_at AS "createdAt" FROM point_protection_events WHERE user_id=u ORDER BY created_at DESC,id DESC LIMIT 30) x),'[]'::jsonb));
END $function$;