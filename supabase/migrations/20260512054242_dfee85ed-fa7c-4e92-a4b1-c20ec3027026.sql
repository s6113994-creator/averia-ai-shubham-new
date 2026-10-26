
-- 1. Shared workspace permissions (rollup of accepted categories)
CREATE TABLE public.shared_workspace_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL UNIQUE,
  permissions_a JSONB NOT NULL DEFAULT '{}'::jsonb,
  permissions_b JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_workspace_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.joint_accounts
    WHERE id = _workspace_id
      AND active = true
      AND (user_a = _user_id OR user_b = _user_id)
  )
$$;

CREATE POLICY "Members can view workspace permissions"
  ON public.shared_workspace_permissions FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members can update workspace permissions"
  ON public.shared_workspace_permissions FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Service can insert workspace permissions"
  ON public.shared_workspace_permissions FOR INSERT
  WITH CHECK (true);

-- 2. Shared vault items
CREATE TABLE public.shared_vault_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  author_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  title TEXT,
  content TEXT,
  media_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  vault_type TEXT NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_vault_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read shared vault"
  ON public.shared_vault_items FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members can insert shared vault"
  ON public.shared_vault_items FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND auth.uid() = author_id);

CREATE POLICY "Authors can delete their shared vault items"
  ON public.shared_vault_items FOR DELETE
  USING (auth.uid() = author_id);

CREATE INDEX idx_shared_vault_workspace ON public.shared_vault_items(workspace_id, created_at DESC);

-- 3. Shared AI conversation (single per workspace)
CREATE TABLE public.shared_ai_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL UNIQUE,
  title TEXT DEFAULT 'Joint Brain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read shared AI conv"
  ON public.shared_ai_conversations FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members can update shared AI conv"
  ON public.shared_ai_conversations FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Service can insert shared AI conv"
  ON public.shared_ai_conversations FOR INSERT
  WITH CHECK (true);

-- 4. Shared AI messages
CREATE TABLE public.shared_ai_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  author_id UUID,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read shared AI msgs"
  ON public.shared_ai_messages FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members can insert shared AI msgs"
  ON public.shared_ai_messages FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX idx_shared_ai_msgs_workspace ON public.shared_ai_messages(workspace_id, created_at);

-- 5. Shared third-party chats
CREATE TABLE public.shared_third_party_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  external_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, external_user_id)
);

ALTER TABLE public.shared_third_party_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members or external can view third-party chat"
  ON public.shared_third_party_chats FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR auth.uid() = external_user_id);

CREATE POLICY "Members can create third-party chat"
  ON public.shared_third_party_chats FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TABLE public.shared_third_party_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.shared_third_party_chats(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_third_party_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view third-party messages"
  ON public.shared_third_party_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shared_third_party_chats c
      WHERE c.id = chat_id
        AND (public.is_workspace_member(c.workspace_id, auth.uid()) OR auth.uid() = c.external_user_id)
    )
  );

CREATE POLICY "Participants can insert third-party messages"
  ON public.shared_third_party_messages FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM public.shared_third_party_chats c
      WHERE c.id = chat_id
        AND (public.is_workspace_member(c.workspace_id, auth.uid()) OR auth.uid() = c.external_user_id)
    )
  );

CREATE INDEX idx_shared_tp_msgs_chat ON public.shared_third_party_messages(chat_id, created_at);

-- 6. Auto-create permissions + AI conversation on Joint Account creation
CREATE OR REPLACE FUNCTION public.bootstrap_shared_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.shared_workspace_permissions (workspace_id, permissions_a, permissions_b)
  VALUES (NEW.id, NEW.permissions_a, NEW.permissions_b)
  ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO public.shared_ai_conversations (workspace_id)
  VALUES (NEW.id)
  ON CONFLICT (workspace_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bootstrap_shared_workspace
  AFTER INSERT ON public.joint_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.bootstrap_shared_workspace();

-- Backfill for existing joint accounts
INSERT INTO public.shared_workspace_permissions (workspace_id, permissions_a, permissions_b)
SELECT id, permissions_a, permissions_b FROM public.joint_accounts
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO public.shared_ai_conversations (workspace_id)
SELECT id FROM public.joint_accounts
ON CONFLICT (workspace_id) DO NOTHING;

-- 7. Realtime
ALTER TABLE public.shared_workspace_permissions REPLICA IDENTITY FULL;
ALTER TABLE public.shared_vault_items REPLICA IDENTITY FULL;
ALTER TABLE public.shared_ai_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.shared_ai_messages REPLICA IDENTITY FULL;
ALTER TABLE public.shared_third_party_chats REPLICA IDENTITY FULL;
ALTER TABLE public.shared_third_party_messages REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_workspace_permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_vault_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_ai_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_ai_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_third_party_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_third_party_messages;
