
CREATE POLICY "vault-media owners select"
ON storage.objects FOR SELECT
USING (bucket_id = 'vault-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "vault-media owners insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vault-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "vault-media owners delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'vault-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow workspace peers (joint accounts) to read each other's vault media
CREATE POLICY "vault-media peers select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'vault-media' AND
  EXISTS (
    SELECT 1 FROM public.joint_accounts ja
    WHERE ja.active = true
      AND (ja.user_a = auth.uid() OR ja.user_b = auth.uid())
      AND (ja.user_a::text = (storage.foldername(name))[1] OR ja.user_b::text = (storage.foldername(name))[1])
  )
);
