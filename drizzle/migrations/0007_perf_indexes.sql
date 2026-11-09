CREATE INDEX IF NOT EXISTS match_players_user_idx ON public.match_players (user_id);
CREATE INDEX IF NOT EXISTS matches_status_idx ON public.matches (status, completed_at DESC);
CREATE INDEX IF NOT EXISTS queue_position_idx ON public.queue (position, joined_at);
CREATE INDEX IF NOT EXISTS profiles_rating_idx ON public.profiles (rating DESC);