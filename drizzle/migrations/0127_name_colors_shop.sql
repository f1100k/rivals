CREATE TABLE public.name_colors (
  id text PRIMARY KEY CHECK (id ~ '^color-[a-f0-9]{32}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 40),
  style text NOT NULL CHECK (style IN ('solid','gradient','neon','metal','glitch','outline','shadow')),
  color1 text NOT NULL CHECK (color1 ~ '^#[0-9a-f]{6}$'),
  color2 text CHECK (color2 IS NULL OR color2 ~ '^#[0-9a-f]{6}$'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.name_colors TO anon, authenticated;
GRANT ALL ON public.name_colors TO service_role;
ALTER TABLE public.name_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY name_colors_read ON public.name_colors FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.player_name_colors (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  color_id text NOT NULL REFERENCES public.name_colors(id) ON DELETE CASCADE,
  equipped boolean NOT NULL DEFAULT false,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid,
  PRIMARY KEY (user_id, color_id)
);
COMMENT ON COLUMN public.player_name_colors.granted_by IS 'Staff member who gifted the color; NULL when bought in the shop.';
CREATE UNIQUE INDEX player_name_colors_one_equipped ON public.player_name_colors(user_id) WHERE equipped;
GRANT SELECT ON public.player_name_colors TO authenticated;
GRANT ALL ON public.player_name_colors TO service_role;
ALTER TABLE public.player_name_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_name_colors_owner_read ON public.player_name_colors FOR SELECT TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.shop_items DROP CONSTRAINT shop_items_kind_check;
ALTER TABLE public.shop_items ADD CONSTRAINT shop_items_kind_check CHECK (kind = ANY (ARRAY['frame'::text, 'placeholder'::text, 'font'::text, 'name_color'::text]));

-- Staff (admins and moderators) create name colors/effects and publish them as shop items.
CREATE OR REPLACE FUNCTION public.staff_save_name_color(p_id text, p_name text, p_style text, p_color1 text, p_color2 text, p_price integer, p_active boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_new boolean; v_c1 text := lower(p_color1); v_c2 text := lower(nullif(p_color2, ''));
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF p_id IS NULL OR p_id !~ '^color-[a-f0-9]{32}$' THEN RAISE EXCEPTION 'Cor inválida.'; END IF;
  IF length(trim(coalesce(p_name,''))) NOT BETWEEN 2 AND 40 THEN RAISE EXCEPTION 'Nome inválido.'; END IF;
  IF p_style IS NULL OR p_style NOT IN ('solid','gradient','neon','metal','glitch','outline','shadow') THEN RAISE EXCEPTION 'Estilo inválido.'; END IF;
  IF v_c1 IS NULL OR v_c1 !~ '^#[0-9a-f]{6}$' OR (v_c2 IS NOT NULL AND v_c2 !~ '^#[0-9a-f]{6}$') THEN RAISE EXCEPTION 'Cor inválida.'; END IF;
  IF p_price IS NULL OR p_price NOT BETWEEN 0 AND 100000 OR p_active IS NULL THEN RAISE EXCEPTION 'Preço inválido.'; END IF;
  v_new := NOT EXISTS (SELECT 1 FROM public.name_colors WHERE id = p_id);
  INSERT INTO public.name_colors(id, name, style, color1, color2, created_by) VALUES (p_id, trim(p_name), p_style, v_c1, v_c2, auth.uid())
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, style = EXCLUDED.style, color1 = EXCLUDED.color1, color2 = EXCLUDED.color2;
  INSERT INTO public.shop_items(id, name, kind, price, active, sort)
    VALUES (p_id, trim(p_name), 'name_color', p_price, p_active, coalesce((SELECT max(sort) + 1 FROM public.shop_items), 0))
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, active = EXCLUDED.active, kind = 'name_color';
  INSERT INTO public.mod_actions(actor_id, action, reason)
    VALUES (auth.uid(), CASE WHEN v_new THEN 'cor_criada' ELSE 'cor_editada' END, trim(p_name) || ', ' || p_price || ' moedas, na loja=' || p_active);
  RETURN p_id;
END $$;

CREATE OR REPLACE FUNCTION public.staff_delete_name_color(p_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_name text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT name INTO v_name FROM public.name_colors WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.name_colors WHERE id = p_id;
  IF EXISTS (SELECT 1 FROM public.shop_purchases WHERE item_id = p_id) THEN
    UPDATE public.shop_items SET active = false WHERE id = p_id;
  ELSE
    DELETE FROM public.shop_items WHERE id = p_id;
  END IF;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'cor_apagada', v_name);
  RETURN true;
END $$;

-- Staff gift (or take back gifted) colors; bought colors are never removed here.
CREATE OR REPLACE FUNCTION public.staff_grant_name_color(p_color text, p_users uuid[], p_remove boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer := 0; v_name text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT name INTO v_name FROM public.name_colors WHERE id = p_color;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cor inexistente.'; END IF;
  IF p_users IS NULL OR cardinality(p_users) = 0 OR cardinality(p_users) > 500 THEN RAISE EXCEPTION 'Escolha os jogadores.'; END IF;
  IF p_remove THEN
    DELETE FROM public.player_name_colors WHERE color_id = p_color AND user_id = ANY(p_users) AND granted_by IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    WITH ins AS (
      INSERT INTO public.player_name_colors(user_id, color_id, granted_by)
      SELECT id, p_color, auth.uid() FROM public.profiles WHERE id = ANY(p_users) AND NOT is_ghost
      ON CONFLICT DO NOTHING RETURNING user_id)
    INSERT INTO public.user_notifications(user_id, kind, title, body)
    SELECT user_id, 'tag', 'Você ganhou uma cor de nome', 'Cor "' || v_name || '" disponível em Perfil → Cor do nome.' FROM ins;
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  INSERT INTO public.mod_actions(actor_id, action, reason)
    VALUES (auth.uid(), CASE WHEN p_remove THEN 'cor_retirada' ELSE 'cor_entregue' END, v_name || ' (' || n || '): ' || array_to_string(p_users, ','));
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.equip_name_color(p_color text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.'; END IF;
  IF p_color IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.player_name_colors WHERE user_id = auth.uid() AND color_id = p_color) THEN
    RAISE EXCEPTION 'Você não tem essa cor.';
  END IF;
  UPDATE public.player_name_colors SET equipped = false WHERE user_id = auth.uid() AND equipped AND color_id IS DISTINCT FROM p_color;
  IF p_color IS NOT NULL THEN
    UPDATE public.player_name_colors SET equipped = true WHERE user_id = auth.uid() AND color_id = p_color;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.get_equipped_name_colors()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'style', c.style, 'color1', c.color1, 'color2', c.color2)), '[]'::jsonb)
  FROM public.player_name_colors p JOIN public.name_colors c ON c.id = p.color_id WHERE p.equipped
$$;

CREATE OR REPLACE FUNCTION public.buy_shop_item(p_item text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_item public.shop_items; v_bal integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_feature(auth.uid(),'shop') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_invalido'; END IF;
  IF v_item.kind = 'font' AND NOT EXISTS (SELECT 1 FROM public.name_fonts WHERE id = p_item) THEN RAISE EXCEPTION 'item_invalido'; END IF;
  IF v_item.kind = 'name_color' AND NOT EXISTS (SELECT 1 FROM public.name_colors WHERE id = p_item) THEN RAISE EXCEPTION 'item_invalido'; END IF;
  INSERT INTO public.coin_wallets(user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  SELECT balance INTO v_bal FROM public.coin_wallets WHERE user_id = auth.uid() FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.shop_purchases WHERE user_id = auth.uid() AND item_id = p_item) THEN RAISE EXCEPTION 'ja_comprado'; END IF;
  IF v_item.kind = 'font' AND EXISTS (SELECT 1 FROM public.player_fonts WHERE user_id = auth.uid() AND font_id = p_item) THEN RAISE EXCEPTION 'ja_comprado'; END IF;
  IF v_item.kind = 'name_color' AND EXISTS (SELECT 1 FROM public.player_name_colors WHERE user_id = auth.uid() AND color_id = p_item) THEN RAISE EXCEPTION 'ja_comprado'; END IF;
  IF v_bal < v_item.price THEN RAISE EXCEPTION 'saldo_insuficiente'; END IF;
  UPDATE public.coin_wallets SET balance = balance - v_item.price, updated_at = now() WHERE user_id = auth.uid() RETURNING balance INTO v_bal;
  INSERT INTO public.shop_purchases(user_id,item_id,price) VALUES (auth.uid(),p_item,v_item.price);
  IF v_item.kind = 'frame' THEN
    INSERT INTO public.avatar_frame_access(user_id,frame) VALUES (auth.uid(),p_item) ON CONFLICT DO NOTHING;
  ELSIF v_item.kind = 'font' THEN
    INSERT INTO public.player_fonts(user_id,font_id) VALUES (auth.uid(),p_item) ON CONFLICT DO NOTHING;
  ELSIF v_item.kind = 'name_color' THEN
    INSERT INTO public.player_name_colors(user_id,color_id) VALUES (auth.uid(),p_item) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES (auth.uid(),'loja_compra',auth.uid(),p_item||' ('||v_item.price||' moedas)');
  RETURN v_bal;
END; $$;

CREATE OR REPLACE FUNCTION public.shop_reset_my_test()
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  DELETE FROM public.avatar_frame_access a USING public.shop_purchases p
    WHERE a.user_id = auth.uid() AND p.user_id = auth.uid() AND a.frame = p.item_id;
  DELETE FROM public.player_fonts f USING public.shop_purchases p
    WHERE f.user_id = auth.uid() AND p.user_id = auth.uid() AND f.font_id = p.item_id AND f.granted_by IS NULL;
  DELETE FROM public.player_name_colors c USING public.shop_purchases p
    WHERE c.user_id = auth.uid() AND p.user_id = auth.uid() AND c.color_id = p.item_id AND c.granted_by IS NULL;
  DELETE FROM public.shop_purchases WHERE user_id = auth.uid();
  UPDATE public.coin_wallets SET balance = 0, updated_at = now() WHERE user_id = auth.uid();
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.staff_save_name_color(text,text,text,text,text,integer,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_delete_name_color(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_grant_name_color(text,uuid[],boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equip_name_color(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_save_name_color(text,text,text,text,text,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_delete_name_color(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_grant_name_color(text,uuid[],boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equip_name_color(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_equipped_name_colors() TO anon, authenticated;