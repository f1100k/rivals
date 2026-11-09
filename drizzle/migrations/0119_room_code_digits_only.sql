CREATE OR REPLACE FUNCTION public.set_room_code(p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_match uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  -- Room codes are numbers only (4 to 10 digits); text is never stored as a code.
  if p_code is null or btrim(p_code) !~ '^[0-9]{4,10}$' then
    raise exception 'invalid_code';
  end if;

  select mp.match_id into v_match
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where mp.user_id = auth.uid() and m.status in ('draft', 'room', 'voting')
  limit 1;
  if v_match is null then
    raise exception 'sem_partida_ativa';
  end if;

  update public.matches set room_code = btrim(p_code) where id = v_match;
  return true;
end;
$function$;