-- Ensure realtime works for shared/private tables used in JOINT scope
ALTER TABLE public.shared_ai_messages REPLICA IDENTITY FULL;
ALTER TABLE public.shared_vault_items REPLICA IDENTITY FULL;
ALTER TABLE public.private_messages REPLICA IDENTITY FULL;
ALTER TABLE public.shared_ai_conversations REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_ai_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_vault_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.private_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_ai_conversations; EXCEPTION WHEN duplicate_object THEN NULL; END;
END$$;

-- Helper RPC: return the other workspace member for the calling user
CREATE OR REPLACE FUNCTION public.current_workspace_peer(_workspace_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN ja.user_a = auth.uid() THEN ja.user_b
    WHEN ja.user_b = auth.uid() THEN ja.user_a
    ELSE NULL
  END
  FROM public.joint_accounts ja
  WHERE ja.id = _workspace_id AND ja.active = true
  LIMIT 1;
$$;