drop function if exists public.ghost_autopick_trg();
create or replace function public.ghost_draft_stmt_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct n.match_id from new_rows n join matches m on m.id = n.match_id
           where m.status = 'draft' and n.team is null loop
    perform ghost_autopick(r.match_id);
  end loop;
  return null;
end $$;
drop trigger if exists ghost_draft on public.match_players;
create trigger ghost_draft after insert on public.match_players
referencing new table as new_rows for each statement execute function public.ghost_draft_stmt_trg();