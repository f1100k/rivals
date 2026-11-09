DELETE FROM public.shop_items WHERE id IN ('teste-barato','teste-medio','teste-caro') AND NOT EXISTS (SELECT 1 FROM public.shop_purchases p WHERE p.item_id = shop_items.id);
REVOKE EXECUTE ON FUNCTION public.shop_add_test_coins(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shop_reset_my_test() FROM PUBLIC, anon, authenticated;