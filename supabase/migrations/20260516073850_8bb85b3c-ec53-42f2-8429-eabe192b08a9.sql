
ALTER TABLE public.private_messages
  ADD COLUMN IF NOT EXISTS shared_workspace_id uuid;

CREATE INDEX IF NOT EXISTS idx_private_messages_ws ON public.private_messages(shared_workspace_id);

DROP POLICY IF EXISTS "Workspace peers can view shared thread messages" ON public.private_messages;
CREATE POLICY "Workspace peers can view shared thread messages"
ON public.private_messages
FOR SELECT
USING (
  shared_workspace_id IS NOT NULL
  AND public.is_workspace_member(shared_workspace_id, auth.uid())
);

DROP POLICY IF EXISTS "Workspace peers can send shared thread messages" ON public.private_messages;
CREATE POLICY "Workspace peers can send shared thread messages"
ON public.private_messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND (
    shared_workspace_id IS NULL
    OR public.is_workspace_member(shared_workspace_id, auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.peer_has_permission(_workspace_id uuid, _target_user uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ja public.joint_accounts%ROWTYPE;
  caller uuid := auth.uid();
  perms jsonb;
BEGIN
  IF caller IS NULL THEN RETURN false; END IF;
  SELECT * INTO ja FROM public.joint_accounts
    WHERE id = _workspace_id AND active = true
      AND (user_a = caller OR user_b = caller)
      AND (user_a = _target_user OR user_b = _target_user)
      AND caller <> _target_user
    LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  IF ja.user_a = _target_user THEN perms := ja.permissions_a;
  ELSE perms := ja.permissions_b;
  END IF;
  RETURN COALESCE((perms ->> _permission)::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_peer_vault_items(_workspace_id uuid, _target_user uuid, _vault_type text)
RETURNS SETOF public.vault_items
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE perm text;
BEGIN
  perm := CASE _vault_type
    WHEN 'public'  THEN 'public_content'
    WHEN 'ghost'   THEN 'personal'
    WHEN 'agentic' THEN 'averia_content'
    ELSE 'public_content' END;
  IF NOT public.peer_has_permission(_workspace_id, _target_user, perm) THEN
    RAISE EXCEPTION 'permission denied by peer' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM public.vault_items
    WHERE user_id = _target_user AND vault_type::text = _vault_type
    ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_peer_ai_conversations(_workspace_id uuid, _target_user uuid)
RETURNS SETOF public.ai_conversations
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.peer_has_permission(_workspace_id, _target_user, 'agentic') THEN
    RAISE EXCEPTION 'permission denied by peer' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.ai_conversations WHERE user_id = _target_user ORDER BY updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_peer_ai_messages(_workspace_id uuid, _target_user uuid, _conversation_id uuid)
RETURNS SETOF public.ai_messages
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.peer_has_permission(_workspace_id, _target_user, 'agentic') THEN
    RAISE EXCEPTION 'permission denied by peer' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.* FROM public.ai_messages m
    JOIN public.ai_conversations c ON c.id = m.conversation_id
    WHERE c.user_id = _target_user AND m.conversation_id = _conversation_id
    ORDER BY m.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_peer_chat_threads(_workspace_id uuid, _target_user uuid)
RETURNS TABLE(other_user uuid, last_message text, last_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.peer_has_permission(_workspace_id, _target_user, 'chat') THEN
    RAISE EXCEPTION 'permission denied by peer' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT DISTINCT ON (peer) peer, content AS last_message, created_at AS last_at
    FROM (
      SELECT receiver_id AS peer, content, created_at FROM public.private_messages WHERE sender_id = _target_user
      UNION ALL
      SELECT sender_id   AS peer, content, created_at FROM public.private_messages WHERE receiver_id = _target_user
    ) t
    ORDER BY peer, created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_peer_private_messages(_workspace_id uuid, _target_user uuid, _other_user uuid)
RETURNS SETOF public.private_messages
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.peer_has_permission(_workspace_id, _target_user, 'chat') THEN
    RAISE EXCEPTION 'permission denied by peer' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM public.private_messages
    WHERE (sender_id = _target_user AND receiver_id = _other_user)
       OR (sender_id = _other_user  AND receiver_id = _target_user)
    ORDER BY created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_peer_scan_history(_workspace_id uuid, _target_user uuid)
RETURNS SETOF public.scan_history
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.peer_has_permission(_workspace_id, _target_user, 'user_content') THEN
    RAISE EXCEPTION 'permission denied by peer' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.scan_history WHERE user_id = _target_user ORDER BY created_at DESC;
END;
$$;
