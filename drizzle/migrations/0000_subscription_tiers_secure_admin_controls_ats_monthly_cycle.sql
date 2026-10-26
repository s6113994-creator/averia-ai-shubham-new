ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

UPDATE public.profiles SET subscription_tier = 'pro' WHERE is_pro = true AND subscription_tier = 'free';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_tier_valid CHECK (subscription_tier IN ('free', 'starter', 'pro', 'enterprise'));

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'pro';
ALTER TABLE public.payment_requests ALTER COLUMN screenshot_url SET DEFAULT '';
ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_plan_valid CHECK (plan IN ('starter', 'pro', 'enterprise'));

ALTER TABLE public.user_trust_scores
  ADD COLUMN IF NOT EXISTS admin_score_override integer;
ALTER TABLE public.user_trust_scores
  ADD CONSTRAINT user_trust_scores_admin_override_valid CHECK (admin_score_override IS NULL OR admin_score_override BETWEEN 0 AND 1000000);

ALTER TABLE public.debunked_news ADD COLUMN IF NOT EXISTS admin_evidence_score smallint;
ALTER TABLE public.debunked_news
  ADD CONSTRAINT debunked_news_admin_evidence_score_valid CHECK (admin_evidence_score IS NULL OR admin_evidence_score BETWEEN 0 AND 100);

GRANT SELECT (subscription_tier, subscription_expires_at) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;
GRANT SELECT ON public.user_trust_scores TO authenticated;
GRANT ALL ON public.user_trust_scores TO service_role;
GRANT SELECT, UPDATE ON public.debunked_news TO authenticated;
GRANT ALL ON public.debunked_news TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_subscription_payment_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'unauthorized payment request' USING ERRCODE = '42501';
  END IF;
  NEW.plan := lower(COALESCE(NEW.plan, 'pro'));
  NEW.amount := CASE NEW.plan
    WHEN 'starter' THEN 199
    WHEN 'pro' THEN 499
    WHEN 'enterprise' THEN 1999
    ELSE NULL
  END;
  IF NEW.amount IS NULL THEN RAISE EXCEPTION 'invalid subscription plan'; END IF;
  IF NEW.utr_number !~ '^[0-9]{12}$' THEN RAISE EXCEPTION 'UTR must contain exactly 12 digits'; END IF;
  NEW.status := 'pending';
  NEW.screenshot_url := '';
  NEW.ai_verification_result := NULL;
  NEW.approved_at := NULL;
  NEW.approved_by := NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prepare_subscription_payment_request_before_insert ON public.payment_requests;
CREATE TRIGGER prepare_subscription_payment_request_before_insert
BEFORE INSERT ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.prepare_subscription_payment_request();

CREATE OR REPLACE FUNCTION public.recompute_trust_score(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_scans int := 0;
  v_debunks int := 0;
  v_public int := 0;
  v_offset int := 0;
  v_override int;
  v_score int := 0;
  v_level text;
BEGIN
  SELECT count(*) INTO v_scans FROM public.scan_history WHERE user_id = _user_id;
  SELECT count(*) INTO v_debunks FROM public.debunked_news WHERE created_by = _user_id;
  SELECT count(*) INTO v_public FROM public.vault_items WHERE user_id = _user_id AND vault_type = 'public';
  SELECT COALESCE(cycle_offset, 0), admin_score_override INTO v_offset, v_override
    FROM public.user_trust_scores WHERE user_id = _user_id;
  v_score := COALESCE(v_override, GREATEST(0, (v_public - v_offset)) * 10);
  v_level := public.get_trust_level(v_score);
  INSERT INTO public.user_trust_scores (user_id, score, level, breakdown, cycle_offset, updated_at)
  VALUES (_user_id, v_score, v_level,
    jsonb_build_object('scans', v_scans, 'debunks', v_debunks, 'public_uploads', v_public), v_offset, now())
  ON CONFLICT (user_id) DO UPDATE
    SET score = EXCLUDED.score, level = EXCLUDED.level, breakdown = EXCLUDED.breakdown, updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_ats_pro_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_score int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  PERFORM public.recompute_trust_score(v_uid);
  SELECT score INTO v_score FROM public.user_trust_scores WHERE user_id = v_uid FOR UPDATE;
  IF v_score < 500 THEN RETURN jsonb_build_object('unlocked', false, 'score', v_score); END IF;
  UPDATE public.profiles
    SET is_pro = true, subscription_tier = 'pro', subscription_expires_at = now() + interval '1 month'
    WHERE user_id = v_uid;
  UPDATE public.user_trust_scores
    SET cycle_offset = COALESCE(cycle_offset, 0) + 50,
        admin_score_override = NULL,
        pro_unlocks_count = COALESCE(pro_unlocks_count, 0) + 1
    WHERE user_id = v_uid;
  PERFORM public.recompute_trust_score(v_uid);
  RETURN jsonb_build_object('unlocked', true, 'score', 0, 'tier', 'pro', 'expires_at', now() + interval '1 month');
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_payment(_payment_id uuid, _decision text, _admin_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.payment_requests%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF _decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'invalid payment decision'; END IF;
  SELECT * INTO v_request FROM public.payment_requests WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' THEN RAISE EXCEPTION 'payment request is not pending'; END IF;
  UPDATE public.payment_requests SET status = _decision::public.payment_status,
    admin_notes = NULLIF(left(COALESCE(_admin_notes, ''), 1000), ''),
    approved_at = CASE WHEN _decision = 'approved' THEN now() ELSE NULL END,
    approved_by = CASE WHEN _decision = 'approved' THEN auth.uid() ELSE NULL END
    WHERE id = _payment_id;
  IF _decision = 'approved' THEN
    UPDATE public.profiles SET subscription_tier = v_request.plan,
      subscription_expires_at = now() + interval '1 month',
      is_pro = (v_request.plan IN ('pro', 'enterprise'))
      WHERE user_id = v_request.user_id;
  END IF;
  RETURN jsonb_build_object('request_id', _payment_id, 'decision', _decision, 'tier', CASE WHEN _decision = 'approved' THEN v_request.plan ELSE NULL END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_subscription(_user_id uuid, _tier text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF _tier NOT IN ('free', 'starter', 'pro', 'enterprise') THEN RAISE EXCEPTION 'invalid subscription tier'; END IF;
  UPDATE public.profiles SET subscription_tier = _tier, subscription_expires_at = NULL,
    is_pro = (_tier IN ('pro', 'enterprise')) WHERE user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user profile not found'; END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'user_id', p.user_id, 'email', p.email, 'name', COALESCE(p.display_name, p.full_name),
    'tier', p.subscription_tier, 'expires_at', p.subscription_expires_at, 'ats', COALESCE(ts.score, 0)
  ) ORDER BY p.created_at DESC) FROM public.profiles p
    LEFT JOIN public.user_trust_scores ts ON ts.user_id = p.user_id), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_ats_score(_user_id uuid, _score integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF _score IS NULL OR _score < 0 OR _score > 1000000 THEN RAISE EXCEPTION 'ATS score must be between 0 and 1000000'; END IF;
  PERFORM public.recompute_trust_score(_user_id);
  UPDATE public.user_trust_scores SET admin_score_override = _score, score = _score,
    level = public.get_trust_level(_score), updated_at = now() WHERE user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user trust score not found'; END IF;
  RETURN _score;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_joint_accounts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', j.id, 'user_a', j.user_a, 'user_b', j.user_b,
    'active', j.active, 'created_at', j.created_at) ORDER BY j.created_at DESC)
    FROM (SELECT * FROM public.joint_accounts ORDER BY created_at DESC LIMIT 250) j), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_joint_active(_workspace_id uuid, _active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE public.joint_accounts SET active = _active, updated_at = now() WHERE id = _workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace not found'; END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_trade_listings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title,
    'seller_name', t.seller_name, 'audit_status', t.audit_status, 'is_sold', t.is_sold, 'created_at', t.created_at)
    ORDER BY t.created_at DESC) FROM (SELECT * FROM public.trade_projects ORDER BY created_at DESC LIMIT 250) t), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_trade_audit_status(_project_id uuid, _status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF _status NOT IN ('pending', 'verified', 'rejected') THEN RAISE EXCEPTION 'invalid audit status'; END IF;
  UPDATE public.trade_projects SET audit_status = _status::public.trade_audit_status, updated_at = now() WHERE id = _project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'trade listing not found'; END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_news_audits()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title,
    'verdict', n.verdict, 'score', n.admin_evidence_score, 'created_at', n.debunked_at)
    ORDER BY n.debunked_at DESC) FROM (SELECT * FROM public.debunked_news ORDER BY debunked_at DESC LIMIT 250) n), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_news_evidence_score(_news_id uuid, _score integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF _score < 0 OR _score > 100 THEN RAISE EXCEPTION 'evidence score must be between 0 and 100'; END IF;
  UPDATE public.debunked_news SET admin_evidence_score = _score WHERE id = _news_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'news audit record not found'; END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_subscription_payment_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_trust_score(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_review_payment(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_user_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_ats_score(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_joint_accounts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_joint_active(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_trade_listings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_trade_audit_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_news_audits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_news_evidence_score(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ats_pro_cycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_payment(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ats_score(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_joint_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_joint_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_trade_listings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_trade_audit_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_news_audits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_news_evidence_score(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ats_pro_cycle() TO authenticated;