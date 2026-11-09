create or replace function public.set_admin_avatar_frame(p_frame text) returns boolean
language plpgsql security definer set search_path = public
as $func$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'sem_permissao'; end if;
  if p_frame is null then
    delete from public.avatar_frames where user_id = auth.uid();
  else
    if p_frame not in ('coroa-fogo','dragao-roxo','coroa-fumaca','gelo-cristal','lua-vermelha','corrente-roxa','leao-dourado','guerreiro-roxo','natureza','demonio-roxo') then raise exception 'invalid_frame'; end if;
    insert into public.avatar_frames(user_id,frame) values (auth.uid(),p_frame) on conflict (user_id) do update set frame=excluded.frame;
  end if;
  insert into public.mod_actions(actor_id,action,target_user,reason) values(auth.uid(),'avatar_frame',auth.uid(),coalesce(p_frame,'none'));
  return true;
end;
$func$;
revoke execute on function public.set_admin_avatar_frame(text) from public, anon;
grant execute on function public.set_admin_avatar_frame(text) to authenticated, service_role;
update public.avatar_frames set frame='coroa-fogo' where frame='coroa';
update public.avatar_frames set frame='dragao-roxo' where frame='dragon';
update public.avatar_frames set frame='gelo-cristal' where frame='ice';
update public.avatar_frames set frame='natureza' where frame='nature';
delete from public.avatar_frames where frame not in ('coroa-fogo','dragao-roxo','coroa-fumaca','gelo-cristal','lua-vermelha','corrente-roxa','leao-dourado','guerreiro-roxo','natureza','demonio-roxo');