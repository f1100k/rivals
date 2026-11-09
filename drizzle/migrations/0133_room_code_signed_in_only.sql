-- Room codes are for signed-in players; the public match history reads every other column.
REVOKE SELECT ON public.matches FROM PUBLIC, anon;
GRANT SELECT (id, mode, region, status, deadline, score_a, score_b, created_at, completed_at, report_a, report_b, reported_by, draft_first_team, shot_score_a, shot_score_b, average_a, average_b, captain_a, captain_b, draft_pool, shot_by, shot_path, shot_approved, had_bots, is_mix)
  ON public.matches TO anon;
