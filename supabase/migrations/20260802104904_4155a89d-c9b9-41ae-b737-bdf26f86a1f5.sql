-- Per-contact chat controls (pin/mute/archive/guard/disappearing)
ALTER TABLE public.chat_contacts
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guard boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disappear_seconds integer NOT NULL DEFAULT 0;

-- Sticky bookmarks / notes pinned inside a thread
CREATE TABLE IF NOT EXISTS public.chat_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  peer_id uuid NOT NULL,
  environment_context text NOT NULL DEFAULT 'personal',
  message_id uuid,
  label text NOT NULL,
  content text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_bookmarks TO authenticated;
GRANT ALL ON public.chat_bookmarks TO service_role;
ALTER TABLE public.chat_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bookmarks" ON public.chat_bookmarks
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Escrow deal locker: immutable signed agreements between two peers
CREATE TABLE IF NOT EXISTS public.chat_escrow_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  counterparty_id uuid NOT NULL,
  environment_context text NOT NULL DEFAULT 'personal',
  title text NOT NULL,
  terms text NOT NULL,
  amount numeric,
  status text NOT NULL DEFAULT 'pending',
  signed_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  locked_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.chat_escrow_deals TO authenticated;
GRANT ALL ON public.chat_escrow_deals TO service_role;
ALTER TABLE public.chat_escrow_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read deals" ON public.chat_escrow_deals
  FOR SELECT TO authenticated USING (auth.uid() = creator_id OR auth.uid() = counterparty_id);
CREATE POLICY "creator inserts deals" ON public.chat_escrow_deals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "participants sign deals" ON public.chat_escrow_deals
  FOR UPDATE TO authenticated USING (auth.uid() = creator_id OR auth.uid() = counterparty_id)
  WITH CHECK (auth.uid() = creator_id OR auth.uid() = counterparty_id);
CREATE TRIGGER trg_escrow_updated BEFORE UPDATE ON public.chat_escrow_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime sync for contacts, bookmarks and deals
ALTER TABLE public.chat_contacts REPLICA IDENTITY FULL;
ALTER TABLE public.chat_bookmarks REPLICA IDENTITY FULL;
ALTER TABLE public.chat_escrow_deals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_bookmarks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_escrow_deals;