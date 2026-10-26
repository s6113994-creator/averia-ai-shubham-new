
-- ATS cycles + Personal Vault PIN + Shared AI multi-thread

-- 1) Trust score cycle tracking
ALTER TABLE public.user_trust_scores
  ADD COLUMN IF NOT EXISTS cycle_offset INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pro_unlocks_count INT NOT NULL DEFAULT 0;

-- 2) Personal Vault PIN hash on profiles
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_vault_pin_hash TEXT;

-- 3) Updated recompute that respects cycle_offset (effective public uploads)
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
  v_score int := 0;
  v_level text;
BEGIN
  SELECT count(*) INTO v_scans FROM public.scan_history WHERE user_id = _user_id;
  SELECT count(*) INTO v_debunks FROM public.debunked_news WHERE created_by = _user_id;
  SELECT count(*) INTO v_public FROM public.vault_items WHERE user_id = _user_id AND vault_type = 'public';
  SELECT COALESCE(cycle_offset, 0) INTO v_offset FROM public.user_trust_scores WHERE user_id = _user_id;

  -- Public uploads drive ATS at +10 each, minus completed cycles (50 uploads/cycle)
  v_score := GREATEST(0, (v_public - v_offset)) * 10;
  v_level := public.get_trust_level(v_score);

  INSERT INTO public.user_trust_scores (user_id, score, level, breakdown, cycle_offset, updated_at)
  VALUES (_user_id, v_score, v_level,
    jsonb_build_object('scans', v_scans, 'debunks', v_debunks, 'public_uploads', v_public),
    v_offset, now())
  ON CONFLICT (user_id) DO UPDATE
    SET score = EXCLUDED.score,
        level = EXCLUDED.level,
        breakdown = EXCLUDED.breakdown,
        updated_at = now();
END;
$function$;

-- 4) Claim Pro cycle when 500 ATS reached
CREATE OR REPLACE FUNCTION public.claim_ats_pro_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_score int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  PERFORM public.recompute_trust_score(v_uid);
  SELECT score INTO v_score FROM public.user_trust_scores WHERE user_id = v_uid;
  IF v_score < 500 THEN
    RETURN jsonb_build_object('unlocked', false, 'score', v_score);
  END IF;
  UPDATE public.profiles SET is_pro = true WHERE user_id = v_uid;
  UPDATE public.user_trust_scores
    SET cycle_offset = COALESCE(cycle_offset,0) + 50,
        pro_unlocks_count = COALESCE(pro_unlocks_count,0) + 1
    WHERE user_id = v_uid;
  PERFORM public.recompute_trust_score(v_uid);
  RETURN jsonb_build_object('unlocked', true, 'score', 0);
END;
$$;

-- 5) PIN setup + verify RPCs
CREATE OR REPLACE FUNCTION public.set_personal_vault_pin(_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'pin must be 4 digits'; END IF;
  UPDATE public.profiles SET personal_vault_pin_hash = crypt(_pin, gen_salt('bf'))
    WHERE user_id = v_uid;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_personal_vault_pin(_pin text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_hash text;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT personal_vault_pin_hash INTO v_hash FROM public.profiles WHERE user_id = v_uid;
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN v_hash = crypt(_pin, v_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.has_personal_vault_pin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND personal_vault_pin_hash IS NOT NULL);
$$;

-- 6) Shared AI multi-thread support: add conversation_id, backfill, index
ALTER TABLE public.shared_ai_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID;

UPDATE public.shared_ai_messages m
  SET conversation_id = c.id
  FROM public.shared_ai_conversations c
  WHERE m.workspace_id = c.workspace_id AND m.conversation_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_shared_ai_messages_conv ON public.shared_ai_messages(conversation_id);

-- 7) Trigger to recompute trust score on vault changes (if not already linked)
DROP TRIGGER IF EXISTS trg_vault_recompute_trust ON public.vault_items;
CREATE TRIGGER trg_vault_recompute_trust
  AFTER INSERT OR DELETE OR UPDATE ON public.vault_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_trust_score();
