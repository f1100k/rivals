-- Win streak counters on the single official MMR source.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS win_streak integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS best_win_streak integer NOT NULL DEFAULT 0;

-- Administrative controls for the exponential win-streak bonus (one row).
CREATE TABLE IF NOT EXISTS public.win_streak_settings (
  id boolean NOT NULL DEFAULT true PRIMARY KEY CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  max_bonus integer NOT NULL DEFAULT 1280,
  max_rewarded_streak integer NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.win_streak_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.win_streak_settings TO authenticated;
GRANT ALL ON public.win_streak_settings TO service_role;
ALTER TABLE public.win_streak_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone signed in can read win streak settings" ON public.win_streak_settings;
CREATE POLICY "Anyone signed in can read win streak settings" ON public.win_streak_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins can change win streak settings" ON public.win_streak_settings;
CREATE POLICY "Admins can change win streak settings" ON public.win_streak_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Immutable per-match MMR ledger: Elo part, streak bonus part, final total.
CREATE TABLE IF NOT EXISTS public.rating_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  rating_before integer NOT NULL,
  elo_delta numeric NOT NULL DEFAULT 0,
  streak_bonus integer NOT NULL DEFAULT 0,
  protection_delta integer NOT NULL DEFAULT 0,
  trolling_delta integer NOT NULL DEFAULT 0,
  total_delta integer NOT NULL,
  rating_after integer NOT NULL,
  win_streak integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rating_history_user_idx ON public.rating_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rating_history_match_idx ON public.rating_history(match_id);
GRANT SELECT ON public.rating_history TO authenticated;
GRANT ALL ON public.rating_history TO service_role;
ALTER TABLE public.rating_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Players can read their own rating history" ON public.rating_history;
CREATE POLICY "Players can read their own rating history" ON public.rating_history
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Promotion / relegation log so rank evolution is never lost.
CREATE TABLE IF NOT EXISTS public.rank_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  from_rank text NOT NULL,
  to_rank text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('promotion', 'relegation')),
  rating integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rank_history_user_idx ON public.rank_history(user_id, created_at DESC);
GRANT SELECT ON public.rank_history TO authenticated;
GRANT ALL ON public.rank_history TO service_role;
ALTER TABLE public.rank_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Players can read their own rank history" ON public.rank_history;
CREATE POLICY "Players can read their own rank history" ON public.rank_history
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Captains are chosen by MMR, so the match row records who they are.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS captain_a uuid;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS captain_b uuid;