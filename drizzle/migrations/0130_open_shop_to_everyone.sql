CREATE OR REPLACE FUNCTION public.buy_shop_item(p_item text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_item public.shop_items; v_bal integer;
BEGIN
  -- The shop is open to every signed-in player; the old per-player 'shop' unlock is no longer required.
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sem_permissao'; END IF;
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
END; $function$;

GRANT SELECT ON public.shop_settings TO authenticated;
DROP POLICY IF EXISTS "shop_settings_read_signed_in" ON public.shop_settings;
CREATE POLICY "shop_settings_read_signed_in" ON public.shop_settings FOR SELECT TO authenticated USING (true);