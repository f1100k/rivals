ALTER TABLE public.player_fonts ADD COLUMN granted_by uuid;
COMMENT ON COLUMN public.player_fonts.granted_by IS 'Staff member who gifted the font; NULL when bought in the shop.';

-- Staff gift (or take back gifted) fonts to chosen players; bought fonts are never removed here.
CREATE OR REPLACE FUNCTION public.staff_grant_font(p_font text, p_users uuid[], p_remove boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer := 0; v_name text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT name INTO v_name FROM public.name_fonts WHERE id = p_font;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fonte inexistente.'; END IF;
  IF p_users IS NULL OR cardinality(p_users) = 0 OR cardinality(p_users) > 500 THEN RAISE EXCEPTION 'Escolha os jogadores.'; END IF;
  IF p_remove THEN
    DELETE FROM public.player_fonts WHERE font_id = p_font AND user_id = ANY(p_users) AND granted_by IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    WITH ins AS (
      INSERT INTO public.player_fonts(user_id, font_id, granted_by)
      SELECT id, p_font, auth.uid() FROM public.profiles WHERE id = ANY(p_users) AND NOT is_ghost
      ON CONFLICT DO NOTHING RETURNING user_id)
    INSERT INTO public.user_notifications(user_id, kind, title, body)
    SELECT user_id, 'tag', 'Você ganhou uma fonte', 'Fonte "' || v_name || '" disponível em Perfil → Fonte do nome.' FROM ins;
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  INSERT INTO public.mod_actions(actor_id, action, reason)
    VALUES (auth.uid(), CASE WHEN p_remove THEN 'fonte_retirada' ELSE 'fonte_entregue' END, v_name || ' (' || n || '): ' || array_to_string(p_users, ','));
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.staff_grant_font(text, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_grant_font(text, uuid[], boolean) TO authenticated;

-- A font the player already received cannot be bought again (no paying twice).
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
  IF v_item.kind = 'font' AND EXISTS (SELECT 1 FROM public.player_fonts WHERE user_id = auth.uid() AND font_id = p_item) THEN RAISE EXCEPTION 'ja_comprado'; END IF;
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