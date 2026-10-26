
-- Vault type enum
DO $$ BEGIN
  CREATE TYPE public.vault_type AS ENUM ('public', 'ghost', 'agentic');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Trust scores cache
CREATE TABLE IF NOT EXISTS public.user_trust_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  score integer NOT NULL DEFAULT 0,
  level text NOT NULL DEFAULT 'Novice',
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_trust_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trust score"
  ON public.user_trust_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert trust scores"
  ON public.user_trust_scores FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update trust scores"
  ON public.user_trust_scores FOR UPDATE
  USING (true);

-- Vault items
CREATE TABLE IF NOT EXISTS public.vault_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vault_type public.vault_type NOT NULL,
  kind text NOT NULL DEFAULT 'note',
  title text,
  content text,
  media_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vault_items_user_type ON public.vault_items(user_id, vault_type, created_at DESC);

ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;

-- Owner can always see their own items (any vault type)
CREATE POLICY "Owners can view their vault items"
  ON public.vault_items FOR SELECT
  USING (auth.uid() = user_id);

-- Public vault items are viewable by everyone
CREATE POLICY "Public vault items are viewable by all"
  ON public.vault_items FOR SELECT
  USING (vault_type = 'public');

CREATE POLICY "Users can insert their own vault items"
  ON public.vault_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vault items"
  ON public.vault_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vault items"
  ON public.vault_items FOR DELETE
  USING (auth.uid() = user_id);

-- Level helper
CREATE OR REPLACE FUNCTION public.get_trust_level(_score integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _score >= 1000 THEN 'Master Investigator'
    WHEN _score >= 400  THEN 'Sentinel'
    WHEN _score >= 100  THEN 'Scout'
    ELSE 'Novice'
  END
$$;

-- Recompute function
CREATE OR REPLACE FUNCTION public.recompute_trust_score(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_scans int := 0;
  v_debunks int := 0;
  v_public int := 0;
  v_score int := 0;
  v_level text;
BEGIN
  SELECT count(*) INTO v_scans FROM public.scan_history WHERE user_id = _user_id;
  SELECT count(*) INTO v_debunks FROM public.debunked_news WHERE created_by = _user_id;
  SELECT count(*) INTO v_public FROM public.vault_items WHERE user_id = _user_id AND vault_type = 'public';

  v_score := (v_scans * 5) + (v_debunks * 25) + (v_public * 10);
  v_level := public.get_trust_level(v_score);

  INSERT INTO public.user_trust_scores (user_id, score, level, breakdown, updated_at)
  VALUES (_user_id, v_score, v_level,
    jsonb_build_object('scans', v_scans, 'debunks', v_debunks, 'public_uploads', v_public),
    now())
  ON CONFLICT (user_id) DO UPDATE
    SET score = EXCLUDED.score,
        level = EXCLUDED.level,
        breakdown = EXCLUDED.breakdown,
        updated_at = now();
END;
$$;

-- Trigger wrapper
CREATE OR REPLACE FUNCTION public.trg_recompute_trust_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_TABLE_NAME = 'debunked_news' THEN
    IF NEW.created_by IS NOT NULL THEN
      PERFORM public.recompute_trust_score(NEW.created_by);
    END IF;
  ELSE
    PERFORM public.recompute_trust_score(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scan_history_trust ON public.scan_history;
CREATE TRIGGER trg_scan_history_trust
  AFTER INSERT ON public.scan_history
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_trust_score();

DROP TRIGGER IF EXISTS trg_debunked_news_trust ON public.debunked_news;
CREATE TRIGGER trg_debunked_news_trust
  AFTER INSERT ON public.debunked_news
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_trust_score();

DROP TRIGGER IF EXISTS trg_vault_items_trust ON public.vault_items;
CREATE TRIGGER trg_vault_items_trust
  AFTER INSERT ON public.vault_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_trust_score();

-- Backfill for existing users
INSERT INTO public.user_trust_scores (user_id, score, level, breakdown)
SELECT p.user_id, 0, 'Novice', '{}'::jsonb
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

-- Recompute for users with existing activity
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.profiles LOOP
    PERFORM public.recompute_trust_score(r.user_id);
  END LOOP;
END $$;
