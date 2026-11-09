CREATE TABLE public.shop_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('frame','placeholder')),
  price integer NOT NULL CHECK (price >= 0),
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.shop_items TO authenticated;
GRANT ALL ON public.shop_items TO service_role;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in read shop items" ON public.shop_items FOR SELECT TO authenticated USING (true);

CREATE TABLE public.coin_wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coin_wallets TO authenticated;
GRANT ALL ON public.coin_wallets TO service_role;
ALTER TABLE public.coin_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads wallet" ON public.coin_wallets FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.shop_purchases (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES public.shop_items(id),
  price integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
GRANT SELECT ON public.shop_purchases TO authenticated;
GRANT ALL ON public.shop_purchases TO service_role;
ALTER TABLE public.shop_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads purchases" ON public.shop_purchases FOR SELECT TO authenticated USING (user_id = auth.uid());

INSERT INTO public.shop_items(id,name,kind,price,sort) VALUES
 ('coroa-fogo','Coroa de Fogo','frame',500,1),
 ('dragao-roxo','Dragão Roxo','frame',500,2),
 ('coroa-fumaca','Coroa de Fumaça','frame',400,3),
 ('gelo-cristal','Gelo Cristal','frame',400,4),
 ('lua-vermelha','Lua Vermelha','frame',600,5),
 ('corrente-roxa','Corrente Roxa','frame',300,6),
 ('leao-dourado','Leão Dourado','frame',600,7),
 ('guerreiro-roxo','Guerreiro','frame',350,8),
 ('natureza','Natureza','frame',250,9),
 ('demonio-roxo','Demônio','frame',450,10),
 ('teste-barato','Item de teste (barato)','placeholder',50,20),
 ('teste-medio','Item de teste (médio)','placeholder',200,21),
 ('teste-caro','Item de teste (caro)','placeholder',5000,22);

-- Store is admin-only for now; the database enforces it.
CREATE OR REPLACE FUNCTION public.buy_shop_item(p_item text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_item public.shop_items; v_bal integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_invalido'; END IF;
  INSERT INTO public.coin_wallets(user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  SELECT balance INTO v_bal FROM public.coin_wallets WHERE user_id = auth.uid() FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.shop_purchases WHERE user_id = auth.uid() AND item_id = p_item) THEN RAISE EXCEPTION 'ja_comprado'; END IF;
  IF v_bal < v_item.price THEN RAISE EXCEPTION 'saldo_insuficiente'; END IF;
  UPDATE public.coin_wallets SET balance = balance - v_item.price, updated_at = now() WHERE user_id = auth.uid() RETURNING balance INTO v_bal;
  INSERT INTO public.shop_purchases(user_id,item_id,price) VALUES (auth.uid(),p_item,v_item.price);
  IF v_item.kind = 'frame' THEN
    INSERT INTO public.avatar_frame_access(user_id,frame) VALUES (auth.uid(),p_item) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES (auth.uid(),'loja_compra',auth.uid(),p_item||' ('||v_item.price||' moedas)');
  RETURN v_bal;
END; $$;

-- Test helper: admins add test coins to their own wallet.
CREATE OR REPLACE FUNCTION public.shop_add_test_coins(p_amount integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_bal integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 10000 THEN RAISE EXCEPTION 'valor_invalido'; END IF;
  INSERT INTO public.coin_wallets(user_id,balance) VALUES (auth.uid(),p_amount)
    ON CONFLICT (user_id) DO UPDATE SET balance = coin_wallets.balance + p_amount, updated_at = now()
    RETURNING balance INTO v_bal;
  INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES (auth.uid(),'loja_moedas_teste',auth.uid(),p_amount::text);
  RETURN v_bal;
END; $$;

-- Test helper: admins undo their own test purchases.
CREATE OR REPLACE FUNCTION public.shop_reset_my_test()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  DELETE FROM public.avatar_frame_access a USING public.shop_purchases p
    WHERE a.user_id = auth.uid() AND p.user_id = auth.uid() AND a.frame = p.item_id;
  DELETE FROM public.shop_purchases WHERE user_id = auth.uid();
  UPDATE public.coin_wallets SET balance = 0, updated_at = now() WHERE user_id = auth.uid();
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.buy_shop_item(text), public.shop_add_test_coins(integer), public.shop_reset_my_test() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buy_shop_item(text), public.shop_add_test_coins(integer), public.shop_reset_my_test() TO authenticated;