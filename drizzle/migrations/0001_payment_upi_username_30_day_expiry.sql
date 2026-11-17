CREATE EXTENSION IF NOT EXISTS pg_cron;
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS payer_upi_username text;
CREATE OR REPLACE FUNCTION public.admin_review_payment(_payment_id uuid, _decision text, _admin_notes text DEFAULT NULL::text)
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
      subscription_expires_at = now() + interval '30 days',
      is_pro = (v_request.plan IN ('pro', 'enterprise'))
      WHERE user_id = v_request.user_id;
  END IF;
  RETURN jsonb_build_object('request_id', _payment_id, 'decision', _decision, 'tier', CASE WHEN _decision = 'approved' THEN v_request.plan ELSE NULL END);
END;
$function$;