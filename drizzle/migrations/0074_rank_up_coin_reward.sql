CREATE OR REPLACE FUNCTION public.rank_grant_coins_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.event = 'rank_grant' THEN
    INSERT INTO coin_wallets(user_id, balance) VALUES (NEW.user_id, 50)
      ON CONFLICT (user_id) DO UPDATE SET balance = coin_wallets.balance + 50, updated_at = now();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rank_grant_coins_trg() FROM public, anon, authenticated;
CREATE TRIGGER rank_grant_coins AFTER INSERT ON public.point_protection_events FOR EACH ROW EXECUTE FUNCTION public.rank_grant_coins_trg();

-- Backfill: every real player gets the protector + 50 coins once for each named tier already reached.
INSERT INTO public.point_protection_wallets(user_id, highest_tier)
  SELECT id, least(5, greatest(0, rating) / 300) FROM public.profiles WHERE NOT is_ghost ON CONFLICT DO NOTHING;
UPDATE public.point_protection_wallets w SET highest_tier = greatest(w.highest_tier, least(5, greatest(0, p.rating) / 300))
  FROM public.profiles p WHERE p.id = w.user_id AND NOT p.is_ghost;
WITH ins AS (
  INSERT INTO public.point_protection_events(user_id, event, event_key, category, stock_change)
  SELECT w.user_id, 'rank_grant', t::text, 'rank', 1
  FROM public.point_protection_wallets w JOIN public.profiles p ON p.id = w.user_id AND NOT p.is_ghost
  CROSS JOIN LATERAL generate_series(1, w.highest_tier) t
  WHERE w.highest_tier >= 1
  ON CONFLICT DO NOTHING RETURNING user_id
)
UPDATE public.point_protection_wallets w SET rank_stock = rank_stock + c.n
  FROM (SELECT user_id, count(*)::int n FROM ins GROUP BY user_id) c WHERE c.user_id = w.user_id;

-- Players who received an earlier rank protector before coins existed also get their 50 coins.
INSERT INTO public.coin_wallets(user_id, balance)
  SELECT e.user_id, 50 * count(*) FROM public.point_protection_events e
  WHERE e.event = 'rank_grant' AND e.created_at < now() GROUP BY e.user_id
  ON CONFLICT (user_id) DO UPDATE SET balance = coin_wallets.balance + EXCLUDED.balance, updated_at = now();