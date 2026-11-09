CREATE TABLE public.discord_links (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  discord_id text NOT NULL UNIQUE,
  discord_username text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.discord_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.discord_links TO authenticated;
GRANT ALL ON public.discord_links TO service_role;
CREATE POLICY "own discord link readable" ON public.discord_links FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.match_voice (
  match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  channel_a text,
  channel_b text,
  created_at timestamptz NOT NULL DEFAULT now(),
  cleaned_at timestamptz
);
ALTER TABLE public.match_voice ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.match_voice TO service_role;