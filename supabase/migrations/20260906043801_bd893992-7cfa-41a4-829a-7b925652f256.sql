-- Trade marketplace security hardening
ALTER TABLE public.trade_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_activities ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.trade_projects TO anon;
GRANT SELECT, INSERT, UPDATE ON public.trade_projects TO authenticated;
GRANT ALL ON public.trade_projects TO service_role;
GRANT SELECT, INSERT ON public.trade_transactions TO authenticated;
GRANT ALL ON public.trade_transactions TO service_role;
GRANT SELECT ON public.trade_activities TO anon;
GRANT SELECT, INSERT ON public.trade_activities TO authenticated;
GRANT ALL ON public.trade_activities TO service_role;

DROP POLICY IF EXISTS "Signed-in users can view active trade listings and their own assets" ON public.trade_projects;
DROP POLICY IF EXISTS "Public active trade listings are viewable by everyone" ON public.trade_projects;
DROP POLICY IF EXISTS "Users can create their own trade listings" ON public.trade_projects;
DROP POLICY IF EXISTS "Owners can edit unsold trade listing details" ON public.trade_projects;
CREATE POLICY "Public active trade listings are viewable by everyone"
  ON public.trade_projects FOR SELECT
  USING (is_sold = false OR seller_id = auth.uid() OR current_owner_id = auth.uid());
CREATE POLICY "Users can create their own trade listings"
  ON public.trade_projects FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid() AND current_owner_id = auth.uid() AND is_sold = false AND audit_status = 'pending');
CREATE POLICY "Owners can edit unsold trade listing details"
  ON public.trade_projects FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() OR current_owner_id = auth.uid())
  WITH CHECK (seller_id = auth.uid() OR current_owner_id = auth.uid());

DROP POLICY IF EXISTS "Buyers and sellers can view their trade transactions" ON public.trade_transactions;
DROP POLICY IF EXISTS "Buyers can create their own trade transactions" ON public.trade_transactions;
CREATE POLICY "Buyers and sellers can view their trade transactions"
  ON public.trade_transactions FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());
CREATE POLICY "Buyers can create their own trade transactions"
  ON public.trade_transactions FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid() AND transaction_type = 'BUY' AND status = 'payment_pending');

DROP POLICY IF EXISTS "Signed-in users can view trade activity" ON public.trade_activities;
DROP POLICY IF EXISTS "Authenticated actors can add trade activity" ON public.trade_activities;
CREATE POLICY "Public trade activity is viewable by everyone"
  ON public.trade_activities FOR SELECT
  USING (true);
CREATE POLICY "Authenticated actors can add trade activity"
  ON public.trade_activities FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.prepare_trade_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.trade_projects%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.trade_projects WHERE id = NEW.project_id FOR UPDATE;
  IF NOT FOUND OR p.is_sold OR p.audit_status <> 'verified' THEN
    RAISE EXCEPTION 'trade listing is unavailable';
  END IF;
  IF p.seller_id = NEW.buyer_id THEN
    RAISE EXCEPTION 'seller cannot purchase their own listing';
  END IF;
  NEW.seller_id := p.seller_id;
  NEW.total_amount_inr := p.asking_price_inr;
  NEW.platform_fee_20 := round(p.asking_price_inr * 0.20, 2);
  NEW.seller_payout_80 := round(p.asking_price_inr * 0.80, 2);
  NEW.transaction_type := 'BUY';
  NEW.status := 'payment_pending';
  NEW.seller_otp_verified := true;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_trade_listing(_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  UPDATE public.trade_projects
  SET audit_status = 'verified', updated_at = now()
  WHERE id = _project_id AND seller_id = auth.uid() AND is_sold = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing verification denied'; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_trade_buyer_verified(_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  UPDATE public.trade_transactions
  SET buyer_otp_verified = true, status = 'under_audit', updated_at = now()
  WHERE id = _transaction_id AND buyer_id = auth.uid() AND status = 'payment_pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'buyer verification denied'; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_trade_purchase(_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.trade_transactions%ROWTYPE; p public.trade_projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO t FROM public.trade_transactions WHERE id = _transaction_id AND buyer_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR t.status <> 'under_audit' OR NOT t.buyer_otp_verified OR NOT t.seller_otp_verified THEN
    RAISE EXCEPTION 'trade purchase is not ready for transfer';
  END IF;
  SELECT * INTO p FROM public.trade_projects WHERE id = t.project_id FOR UPDATE;
  IF NOT FOUND OR p.is_sold THEN RAISE EXCEPTION 'trade listing is no longer available'; END IF;
  UPDATE public.trade_projects
  SET current_owner_id = t.buyer_id, current_owner_name = t.buyer_name,
      current_owner_averia_id = t.buyer_averia_id, is_sold = true, updated_at = now()
  WHERE id = p.id;
  UPDATE public.trade_transactions SET status = 'transferred', updated_at = now() WHERE id = t.id;
  INSERT INTO public.trade_activities (project_id, project_title, action_type, actor_id, actor_name, actor_averia_id, target_id, target_name, target_averia_id, price_inr)
  VALUES (p.id, p.title, 'SOLD', t.seller_id, p.seller_name, p.seller_averia_id, t.buyer_id, t.buyer_name, t.buyer_averia_id, t.total_amount_inr);
  INSERT INTO public.trade_activities (project_id, project_title, action_type, actor_id, actor_name, actor_averia_id, target_id, target_name, target_averia_id, price_inr)
  VALUES (p.id, p.title, 'TRANSFERRED', t.seller_id, p.seller_name, p.seller_averia_id, t.buyer_id, t.buyer_name, t.buyer_averia_id, t.total_amount_inr);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_trade_transaction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_trade_listing(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_trade_buyer_verified(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_trade_purchase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_trade_listing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_trade_buyer_verified(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_trade_purchase(uuid) TO authenticated;