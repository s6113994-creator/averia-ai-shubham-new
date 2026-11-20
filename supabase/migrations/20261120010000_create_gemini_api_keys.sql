-- =========================================================
-- GLOBAL MULTI-PROVIDER API KEYS & LOAD-BALANCING SCHEMA
-- Supports 10 Gemini Keys, 10 YouTube Keys, and 4 News Keys
-- =========================================================

-- 1. GEMINI API KEYS TABLE (10 Keys Pool)
CREATE TABLE IF NOT EXISTS public.gemini_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gemini_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to gemini_api_keys" ON public.gemini_api_keys;
CREATE POLICY "Service role full access to gemini_api_keys"
    ON public.gemini_api_keys
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_gemini_keys_active_errors 
    ON public.gemini_api_keys (is_active, error_count);

-- 2. YOUTUBE API KEYS TABLE (10 Keys Pool)
CREATE TABLE IF NOT EXISTS public.youtube_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.youtube_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to youtube_api_keys" ON public.youtube_api_keys;
CREATE POLICY "Service role full access to youtube_api_keys"
    ON public.youtube_api_keys
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_youtube_keys_active_errors 
    ON public.youtube_api_keys (is_active, error_count);

-- 3. NEWS API KEYS TABLE (4 Keys Pool)
CREATE TABLE IF NOT EXISTS public.news_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.news_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to news_api_keys" ON public.news_api_keys;
CREATE POLICY "Service role full access to news_api_keys"
    ON public.news_api_keys
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_news_keys_active_errors 
    ON public.news_api_keys (is_active, error_count);

-- Seed default News API keys
INSERT INTO public.news_api_keys (key_name, api_key) VALUES
  ('NewsAPI Key 1', '2a2c607411b2488f9b5bab17af6a8ea5'),
  ('NewsAPI Key 2', '59ae1b46bd4046a0ade43d48c5e4417e'),
  ('NewsAPI Key 3', 'a4e70f9af3a34627ab3f90d9aa36d811'),
  ('NewsAPI Key 4', '30a4ac64313f4acd8926dd1857c2fedf')
ON CONFLICT (api_key) DO UPDATE SET is_active = true;
