CREATE OR REPLACE FUNCTION public.draft_assign(p_match uuid, p_target uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  update match_players set team = draft_turn(p_match)
  where match_id = p_match and user_id = p_target and team is null;
  select count(*) into v_n from match_players where match_id = p_match and team is not null and position <> 'Goleiro';
  -- A2, B2, A2 -> the last 2 go automatically to team B
  if v_n >= 6 then
    update match_players set team = 'b' where match_id = p_match and team is null;
  end if;
  if not exists (select 1 from match_players where match_id = p_match and team is null) then
    update matches set status = 'room', deadline = null where id = p_match and status = 'draft';
    return;
  end if;
  if v_n % 2 = 0 then
    update matches set deadline = now() + interval '30 seconds' where id = p_match;
  end if;
end $function$;