CREATE TYPE public.trade_asset_category AS ENUM ('Website', 'App', 'Image', 'Video', 'Audio', 'SaaS');
CREATE TYPE public.trade_audit_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE public.trade_transaction_type AS ENUM ('SALE', 'BUY');
CREATE TYPE public.trade_transaction_status AS ENUM ('payment_pending', 'under_audit', 'transferred', 'disputed');
CREATE TYPE public.trade_activity_action AS ENUM ('LISTED', 'SOLD', 'TRANSFERRED');

CREATE TABLE public.trade_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  seller_name text NOT NULL,
  seller_averia_id text NOT NULL,
  current_owner_id uuid NOT NULL,
  current_owner_name text NOT NULL,
  current_owner_averia_id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 5000),
  category public.trade_asset_category NOT NULL,
  tech_stack text[] NOT NULL DEFAULT '{}',
  demo_url text,
  asking_price_inr numeric(12,2) NOT NULL CHECK (asking_price_inr > 0),
  seller_upi_id text NOT NULL,
  seller_upi_registered_name text NOT NULL,
  seller_qr_code_url text,
  source_code_file_url text,
  is_sold boolean NOT NULL DEFAULT false,
  audit_status public.trade_audit_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.trade_projects TO authenticated;
GRANT ALL ON public.trade_projects TO service_role;
ALTER TABLE public.trade_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view active trade listings and their own assets"
  ON public.trade_projects FOR SELECT TO authenticated
  USING (is_sold = false OR seller_id = auth.uid() OR current_owner_id = auth.uid());
CREATE POLICY "Users can create their own trade listings"
  ON public.trade_projects FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid() AND current_owner_id = auth.uid() AND is_sold = false AND audit_status = 'pending');
CREATE POLICY "Owners can edit unsold trade listing details"
  ON public.trade_projects FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() AND is_sold = false)
  WITH CHECK (seller_id = auth.uid() AND is_sold = false);

CREATE TABLE public.trade_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.trade_projects(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  buyer_name text NOT NULL,
  buyer_averia_id text NOT NULL,
  total_amount_inr numeric(12,2) NOT NULL CHECK (total_amount_inr > 0),
  platform_fee_20 numeric(12,2) NOT NULL DEFAULT 0,
  seller_payout_80 numeric(12,2) NOT NULL DEFAULT 0,
  buyer_screenshot_url text,
  utr_transaction_id text CHECK (utr_transaction_id IS NULL OR utr_transaction_id ~ '^[0-9]{12}$'),
  seller_otp_verified boolean NOT NULL DEFAULT false,
  buyer_otp_verified boolean NOT NULL DEFAULT false,
  transaction_type public.trade_transaction_type NOT NULL DEFAULT 'BUY',
  status public.trade_transaction_status NOT NULL DEFAULT 'payment_pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.trade_transactions TO authenticated;
GRANT ALL ON public.trade_transactions TO service_role;
ALTER TABLE public.trade_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyers and sellers can view their trade transactions"
  ON public.trade_transactions FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());
CREATE POLICY "Buyers can create their own trade transactions"
  ON public.trade_transactions FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid() AND transaction_type = 'BUY' AND status = 'payment_pending');

CREATE TABLE public.trade_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.trade_projects(id) ON DELETE CASCADE,
  project_title text NOT NULL,
  action_type public.trade_activity_action NOT NULL,
  actor_id uuid NOT NULL,
  actor_name text NOT NULL,
  actor_averia_id text NOT NULL,
  target_id uuid,
  target_name text,
  target_averia_id text,
  price_inr numeric(12,2),
  timestamp timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trade_activities TO authenticated;
GRANT ALL ON public.trade_activities TO service_role;
ALTER TABLE public.trade_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view trade activity"
  ON public.trade_activities FOR SELECT TO authenticated
  USING (true);

CREATE INDEX trade_projects_active_created_idx ON public.trade_projects (is_sold, created_at DESC);
CREATE INDEX trade_projects_seller_idx ON public.trade_projects (seller_id, created_at DESC);
CREATE INDEX trade_projects_owner_idx ON public.trade_projects (current_owner_id, created_at DESC);
CREATE INDEX trade_transactions_buyer_idx ON public.trade_transactions (buyer_id, created_at DESC);
CREATE INDEX trade_transactions_seller_idx ON public.trade_transactions (seller_id, created_at DESC);
CREATE INDEX trade_activities_timestamp_idx ON public.trade_activities (timestamp DESC);
CREATE UNIQUE INDEX trade_one_open_purchase_per_project_idx ON public.trade_transactions (project_id) WHERE status IN ('payment_pending', 'under_audit');

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
CREATE TRIGGER prepare_trade_transaction_before_insert
  BEFORE INSERT ON public.trade_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prepare_trade_transaction();

CREATE OR REPLACE FUNCTION public.verify_trade_listing(_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
  SELECT * INTO t FROM public.trade_transactions WHERE id = _transaction_id AND buyer_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR t.status <> 'under_audit' OR NOT t.buyer_otp_verified OR NOT t.seller_otp_verified THEN
    RAISE EXCEPTION 'trade purchase is not ready for transfer';
  END IF;
  SELECT * INTO p FROM public.trade_projects WHERE id = t.project_id FOR UPDATE;
  IF NOT FOUND OR p.is_sold THEN RAISE EXCEPTION 'trade listing is no longer available'; END IF;
  UPDATE public.trade_projects
  SET current_owner_id = t.buyer_id,
      current_owner_name = t.buyer_name,
      current_owner_averia_id = t.buyer_averia_id,
      is_sold = true,
      updated_at = now()
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

CREATE OR REPLACE FUNCTION public.trade_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trade_projects_updated_at BEFORE UPDATE ON public.trade_projects FOR EACH ROW EXECUTE FUNCTION public.trade_updated_at();
CREATE TRIGGER trade_transactions_updated_at BEFORE UPDATE ON public.trade_transactions FOR EACH ROW EXECUTE FUNCTION public.trade_updated_at();

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_projects; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_activities; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;