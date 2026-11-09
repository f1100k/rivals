ALTER TABLE public.promo_settings ADD COLUMN IF NOT EXISTS size_percent integer NOT NULL DEFAULT 100;

CREATE OR REPLACE FUNCTION public.admin_set_promo_settings(p_interval integer, p_enabled boolean, p_size integer DEFAULT 100)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  INSERT INTO public.promo_settings(id, interval_seconds, enabled, size_percent, updated_at)
  VALUES (true, p_interval, p_enabled, least(200, greatest(60, coalesce(p_size, 100))), now())
  ON CONFLICT (id) DO UPDATE SET interval_seconds = EXCLUDED.interval_seconds, enabled = EXCLUDED.enabled, size_percent = EXCLUDED.size_percent, updated_at = now();
  RETURN true;
END $function$;