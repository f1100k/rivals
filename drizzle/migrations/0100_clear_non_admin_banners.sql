UPDATE public.profiles p SET banner_url = NULL
WHERE p.banner_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin');