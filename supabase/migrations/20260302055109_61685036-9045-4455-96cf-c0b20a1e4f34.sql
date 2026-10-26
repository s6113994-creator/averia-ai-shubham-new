
-- Cache table for YouTube and News API responses
CREATE TABLE public.api_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text NOT NULL UNIQUE,
  data jsonb NOT NULL,
  source text NOT NULL DEFAULT 'youtube',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '6 hours')
);

-- Index for fast lookups
CREATE INDEX idx_api_cache_key ON public.api_cache (cache_key);
CREATE INDEX idx_api_cache_expires ON public.api_cache (expires_at);

-- Enable RLS
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read cache (public data)
CREATE POLICY "Anyone can read cache" ON public.api_cache FOR SELECT USING (true);

-- Anyone can insert cache entries
CREATE POLICY "Anyone can insert cache" ON public.api_cache FOR INSERT WITH CHECK (true);

-- Cleanup function for expired entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.api_cache WHERE expires_at < now();
  RETURN NEW;
END;
$$;

-- Auto-cleanup on insert
CREATE TRIGGER cleanup_cache_on_insert
AFTER INSERT ON public.api_cache
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_expired_cache();
