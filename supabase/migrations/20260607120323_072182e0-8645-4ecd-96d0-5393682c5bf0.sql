
-- Avatars bucket: per-user CRUD + global read (authenticated)
CREATE POLICY "Avatars are viewable by authenticated users" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Single active joint relationship per user (only one row where user is user_a OR user_b with active=true)
CREATE OR REPLACE FUNCTION public.enforce_single_active_joint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active = true THEN
    IF EXISTS (
      SELECT 1 FROM public.joint_accounts
      WHERE active = true
        AND id <> NEW.id
        AND (user_a = NEW.user_a OR user_b = NEW.user_a
          OR user_a = NEW.user_b OR user_b = NEW.user_b)
    ) THEN
      RAISE EXCEPTION 'User already has an active joint workspace (max 1 allowed)'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_active_joint ON public.joint_accounts;
CREATE TRIGGER trg_enforce_single_active_joint
  BEFORE INSERT OR UPDATE ON public.joint_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_active_joint();
