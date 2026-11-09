CREATE OR REPLACE FUNCTION public.admin_save_shop_item(p_id text, p_name text, p_price integer, p_active boolean, p_sort integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_kind text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 IF length(trim(p_name)) NOT BETWEEN 2 AND 60 OR p_price NOT BETWEEN 0 AND 100000 OR p_sort NOT BETWEEN 0 AND 100000 OR p_active IS NULL THEN RAISE EXCEPTION 'Item inválido.'; END IF;
 SELECT kind INTO v_kind FROM public.shop_items WHERE id = p_id;
 IF v_kind IS NULL THEN
   IF EXISTS(SELECT 1 FROM public.name_fonts WHERE id = p_id) THEN v_kind := 'font';
   ELSIF EXISTS(SELECT 1 FROM public.name_colors WHERE id = p_id) THEN v_kind := 'name_color';
   ELSIF public.valid_avatar_frame(p_id) THEN v_kind := 'frame';
   ELSE RAISE EXCEPTION 'Cadastre o item primeiro.'; END IF;
 END IF;
 IF v_kind = 'frame' AND p_active AND p_id LIKE 'custom-%' AND NOT public.valid_avatar_frame(p_id) THEN RAISE EXCEPTION 'Esta moldura foi apagada do site.'; END IF;
 INSERT INTO public.shop_items(id,name,kind,price,active,sort) VALUES(p_id,trim(p_name),v_kind,p_price,p_active,p_sort)
   ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,price=EXCLUDED.price,active=EXCLUDED.active,sort=EXCLUDED.sort;
 INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'loja_item_editado',p_id||': '||p_name||', '||p_price||' moedas, visível='||p_active);
 RETURN true;
END $function$;