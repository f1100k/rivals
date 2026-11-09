CREATE TABLE public.name_fonts (
  id text PRIMARY KEY CHECK (id ~ '^font-[a-f0-9]{32}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 40),
  file_path text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.name_fonts TO anon, authenticated;
GRANT ALL ON public.name_fonts TO service_role;
ALTER TABLE public.name_fonts ENABLE ROW LEVEL SECURITY;
CREATE POLICY name_fonts_read ON public.name_fonts FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.player_fonts (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  font_id text NOT NULL REFERENCES public.name_fonts(id) ON DELETE CASCADE,
  equipped boolean NOT NULL DEFAULT false,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, font_id)
);
CREATE UNIQUE INDEX player_fonts_one_equipped ON public.player_fonts(user_id) WHERE equipped;
CREATE INDEX player_fonts_equipped ON public.player_fonts(font_id) WHERE equipped;
GRANT SELECT ON public.player_fonts TO authenticated;
GRANT ALL ON public.player_fonts TO service_role;
ALTER TABLE public.player_fonts ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_fonts_owner_read ON public.player_fonts FOR SELECT TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.shop_items DROP CONSTRAINT shop_items_kind_check;
ALTER TABLE public.shop_items ADD CONSTRAINT shop_items_kind_check CHECK (kind = ANY (ARRAY['frame'::text, 'placeholder'::text, 'font'::text]));

-- Staff (admins and moderators) import fonts and publish them as shop items.
CREATE OR REPLACE FUNCTION public.staff_save_font(p_id text, p_name text, p_path text, p_price integer, p_active boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_new boolean;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF p_id IS NULL OR p_id !~ '^font-[a-f0-9]{32}$' THEN RAISE EXCEPTION 'Fonte inválida.'; END IF;
  IF length(trim(coalesce(p_name,''))) NOT BETWEEN 2 AND 40 THEN RAISE EXCEPTION 'Nome inválido.'; END IF;
  IF p_path IS NULL OR length(p_path) NOT BETWEEN 1 AND 300 OR p_path !~ '^[A-Za-z0-9/_.-]+$' OR p_path NOT LIKE p_id || '/%' OR p_path ~ '\.\.' THEN RAISE EXCEPTION 'Arquivo inválido.'; END IF;
  IF p_price IS NULL OR p_price NOT BETWEEN 0 AND 100000 OR p_active IS NULL THEN RAISE EXCEPTION 'Preço inválido.'; END IF;
  v_new := NOT EXISTS (SELECT 1 FROM public.name_fonts WHERE id = p_id);
  INSERT INTO public.name_fonts(id, name, file_path, created_by) VALUES (p_id, trim(p_name), p_path, auth.uid())
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, file_path = EXCLUDED.file_path;
  INSERT INTO public.shop_items(id, name, kind, price, active, sort)
    VALUES (p_id, trim(p_name), 'font', p_price, p_active, coalesce((SELECT max(sort) + 1 FROM public.shop_items), 0))
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, active = EXCLUDED.active, kind = 'font';
  INSERT INTO public.mod_actions(actor_id, action, reason)
    VALUES (auth.uid(), CASE WHEN v_new THEN 'fonte_criada' ELSE 'fonte_editada' END, trim(p_name) || ', ' || p_price || ' moedas, na loja=' || p_active);
  RETURN p_id;
END $$;

CREATE OR REPLACE FUNCTION public.staff_delete_font(p_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_font public.name_fonts;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT * INTO v_font FROM public.name_fonts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM public.name_fonts WHERE id = p_id;
  IF EXISTS (SELECT 1 FROM public.shop_purchases WHERE item_id = p_id) THEN
    UPDATE public.shop_items SET active = false WHERE id = p_id;
  ELSE
    DELETE FROM public.shop_items WHERE id = p_id;
  END IF;
  INSERT INTO public.mod_actions(actor_id, action, reason) VALUES (auth.uid(), 'fonte_apagada', v_font.name);
  RETURN v_font.file_path;
END $$;

CREATE OR REPLACE FUNCTION public.equip_name_font(p_font text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.'; END IF;
  IF p_font IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.player_fonts WHERE user_id = auth.uid() AND font_id = p_font) THEN
    RAISE EXCEPTION 'Você não tem essa fonte.';
  END IF;
  UPDATE public.player_fonts SET equipped = false WHERE user_id = auth.uid() AND equipped AND font_id IS DISTINCT FROM p_font;
  IF p_font IS NOT NULL THEN
    UPDATE public.player_fonts SET equipped = true WHERE user_id = auth.uid() AND font_id = p_font;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.get_equipped_fonts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'font_id', p.font_id)), '[]'::jsonb)
  FROM public.player_fonts p WHERE p.equipped
$$;

-- Buying a font item gives the player that font; a deleted font cannot be bought.
CREATE OR REPLACE FUNCTION public.buy_shop_item(p_item text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_item public.shop_items; v_bal integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_feature(auth.uid(),'shop') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_invalido'; END IF;
  IF v_item.kind = 'font' AND NOT EXISTS (SELECT 1 FROM public.name_fonts WHERE id = p_item) THEN RAISE EXCEPTION 'item_invalido'; END IF;
  INSERT INTO public.coin_wallets(user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  SELECT balance INTO v_bal FROM public.coin_wallets WHERE user_id = auth.uid() FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.shop_purchases WHERE user_id = auth.uid() AND item_id = p_item) THEN RAISE EXCEPTION 'ja_comprado'; END IF;
  IF v_bal < v_item.price THEN RAISE EXCEPTION 'saldo_insuficiente'; END IF;
  UPDATE public.coin_wallets SET balance = balance - v_item.price, updated_at = now() WHERE user_id = auth.uid() RETURNING balance INTO v_bal;
  INSERT INTO public.shop_purchases(user_id,item_id,price) VALUES (auth.uid(),p_item,v_item.price);
  IF v_item.kind = 'frame' THEN
    INSERT INTO public.avatar_frame_access(user_id,frame) VALUES (auth.uid(),p_item) ON CONFLICT DO NOTHING;
  ELSIF v_item.kind = 'font' THEN
    INSERT INTO public.player_fonts(user_id,font_id) VALUES (auth.uid(),p_item) ON CONFLICT DO NOTHING;
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
    WHERE f.user_id = auth.uid() AND p.user_id = auth.uid() AND f.font_id = p.item_id;
  DELETE FROM public.shop_purchases WHERE user_id = auth.uid();
  UPDATE public.coin_wallets SET balance = 0, updated_at = now() WHERE user_id = auth.uid();
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.staff_save_font(text,text,text,integer,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_delete_font(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equip_name_font(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_save_font(text,text,text,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_delete_font(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equip_name_font(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_equipped_fonts() TO anon, authenticated;

CREATE POLICY "Staff enviam fontes" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'name-fonts' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff veem arquivos de fontes" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'name-fonts' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff apagam fontes" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'name-fonts' AND public.is_staff(auth.uid()));