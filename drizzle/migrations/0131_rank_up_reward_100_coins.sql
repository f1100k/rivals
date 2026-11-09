CREATE OR REPLACE FUNCTION public.rank_grant_coins_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Each one-time rank-up reward gives 100 coins (raised from 50 on 2026-11-09; past grants unchanged).
  IF NEW.event = 'rank_grant' THEN
    INSERT INTO coin_wallets(user_id, balance) VALUES (NEW.user_id, 100)
      ON CONFLICT (user_id) DO UPDATE SET balance = coin_wallets.balance + 100, updated_at = now();
  END IF;
  RETURN NEW;
END $function$;