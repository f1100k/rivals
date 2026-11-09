-- Save/GK board: only saves made by someone listed as 'Goleiro' count,
-- and the games column counts only matches played in goal.
select 'gk_saves_filter_on_goalkeeper' as rule,
  pg_get_functiondef(p.oid) like '%sum(s.saves) FILTER (WHERE mp.position = ''Goleiro'')%' as passed
from pg_proc p where p.proname = 'get_stat_leaders'
union all
select 'gk_games_filter_on_goalkeeper',
  pg_get_functiondef(p.oid) like '%count(*) FILTER (WHERE mp.position = ''Goleiro'')%'
from pg_proc p where p.proname = 'get_stat_leaders'
union all
select 'general_defesa_still_counts_everyone',
  pg_get_functiondef(p.oid) like '%sum(s.saves)::int AS saves%'
from pg_proc p where p.proname = 'get_stat_leaders'
union all
select 'cancelled_matches_excluded',
  pg_get_functiondef(p.oid) like '%m.status <> ''cancelled''%'
from pg_proc p where p.proname = 'get_stat_leaders';
