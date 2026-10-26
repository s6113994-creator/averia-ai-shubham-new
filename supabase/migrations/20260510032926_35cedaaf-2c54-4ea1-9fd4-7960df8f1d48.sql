-- Add columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS averia_id text;

-- Function to generate a unique 8-char Averia ID (excluding ambiguous chars)
CREATE OR REPLACE FUNCTION public.generate_averia_id()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i int;
  exists_check int;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    result := 'AV-' || result;
    SELECT count(*) INTO exists_check FROM public.profiles WHERE averia_id = result;
    EXIT WHEN exists_check = 0;
  END LOOP;
  RETURN result;
END;
$$;

-- Trigger to auto-assign averia_id on insert if null
CREATE OR REPLACE FUNCTION public.assign_averia_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.averia_id IS NULL OR NEW.averia_id = '' THEN
    NEW.averia_id := public.generate_averia_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_averia_id ON public.profiles;
CREATE TRIGGER trg_assign_averia_id
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_averia_id();

-- Backfill existing rows
UPDATE public.profiles
SET averia_id = public.generate_averia_id()
WHERE averia_id IS NULL OR averia_id = '';

-- Add unique + not null
ALTER TABLE public.profiles
  ALTER COLUMN averia_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_averia_id_unique ON public.profiles(averia_id);

-- RLS: allow authenticated users to look up minimal info by averia_id (Partner Picker)
DROP POLICY IF EXISTS "Authenticated can lookup profiles by averia_id" ON public.profiles;
CREATE POLICY "Authenticated can lookup profiles by averia_id"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);