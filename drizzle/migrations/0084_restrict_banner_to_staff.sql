CREATE OR REPLACE FUNCTION public.guard_profile_banner_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.banner_url IS DISTINCT FROM OLD.banner_url
     AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'banner restrito a administradores';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_banner_staff ON public.profiles;
CREATE TRIGGER guard_profile_banner_staff
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_banner_staff();