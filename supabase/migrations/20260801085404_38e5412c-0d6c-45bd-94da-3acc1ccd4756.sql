
-- PERSONAL SCOPE CHATS
CREATE TABLE public.user_personal_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'text',
  media_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reply_to uuid,
  read boolean NOT NULL DEFAULT false,
  self_destruct boolean NOT NULL DEFAULT false,
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_personal_chats TO authenticated;
GRANT ALL ON public.user_personal_chats TO service_role;
ALTER TABLE public.user_personal_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "personal chat participants read" ON public.user_personal_chats FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "personal chat send" ON public.user_personal_chats FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());
CREATE POLICY "personal chat update" ON public.user_personal_chats FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "personal chat delete own" ON public.user_personal_chats FOR DELETE TO authenticated
  USING (sender_id = auth.uid());
CREATE INDEX idx_upc_pair ON public.user_personal_chats (sender_id, receiver_id, created_at);
CREATE INDEX idx_upc_recv ON public.user_personal_chats (receiver_id, created_at);

-- JOINT SCOPE CHATS
CREATE TABLE public.joint_workspace_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'text',
  media_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reply_to uuid,
  read boolean NOT NULL DEFAULT false,
  self_destruct boolean NOT NULL DEFAULT false,
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.joint_workspace_chats TO authenticated;
GRANT ALL ON public.joint_workspace_chats TO service_role;
ALTER TABLE public.joint_workspace_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "joint chat members read" ON public.joint_workspace_chats FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "joint chat send" ON public.joint_workspace_chats FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "joint chat update" ON public.joint_workspace_chats FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "joint chat delete own" ON public.joint_workspace_chats FOR DELETE TO authenticated
  USING (sender_id = auth.uid());
CREATE INDEX idx_jwc_ws ON public.joint_workspace_chats (workspace_id, created_at);

-- PINNED CONTACTS (context isolated)
CREATE TABLE public.chat_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  environment_context text NOT NULL DEFAULT 'personal',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, contact_id, environment_context)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_contacts TO authenticated;
GRANT ALL ON public.chat_contacts TO service_role;
ALTER TABLE public.chat_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contacts" ON public.chat_contacts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_personal_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.joint_workspace_chats;
