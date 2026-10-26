REVOKE EXECUTE ON FUNCTION public.verify_trade_listing(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_trade_buyer_verified(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_trade_purchase(uuid) FROM PUBLIC, anon, authenticated;