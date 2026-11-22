-- Migration: Create averia_app_data table for Genesis-generated app persistence
-- This table is the universal multi-tenant key-value store for all apps built by Genesis.
-- The averia-backend Edge Function reads/writes records here using the service_role key.

CREATE TABLE IF NOT EXISTS public.averia_app_data (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  text        NOT NULL,
  collection  text        NOT NULL,
  record_id   text        NOT NULL,
  data        jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, collection, record_id)
);

CREATE INDEX IF NOT EXISTS idx_averia_app_data_project_collection
  ON public.averia_app_data (project_id, collection);

-- Enable RLS so the table is protected by default
ALTER TABLE public.averia_app_data ENABLE ROW LEVEL SECURITY;

-- Allow the Edge Function (service_role) full access; anon reads are blocked
-- (the averia-backend function uses getAdminSupabase() which uses service_role)
DROP POLICY IF EXISTS "averia_backend_service_role" ON public.averia_app_data;
CREATE POLICY "averia_backend_service_role" ON public.averia_app_data
  FOR ALL
  USING (true)
  WITH CHECK (true);
