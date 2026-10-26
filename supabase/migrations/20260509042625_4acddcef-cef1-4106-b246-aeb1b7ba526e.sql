-- Enums
DO $$ BEGIN
  CREATE TYPE public.joint_request_status AS ENUM ('pending','accepted','declined','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Requests
CREATE TABLE IF NOT EXISTS public.joint_account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  from_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  to_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.joint_request_status NOT NULL DEFAULT 'pending',
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user <> to_user)
);
CREATE INDEX IF NOT EXISTS idx_jar_to_user_status ON public.joint_account_requests(to_user, status);
CREATE INDEX IF NOT EXISTS idx_jar_from_user_status ON public.joint_account_requests(from_user, status);

ALTER TABLE public.joint_account_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own requests"
  ON public.joint_account_requests FOR SELECT
  USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "Users can send requests"
  ON public.joint_account_requests FOR INSERT
  WITH CHECK (auth.uid() = from_user);

CREATE POLICY "Recipients or senders can update requests"
  ON public.joint_account_requests FOR UPDATE
  USING (auth.uid() = to_user OR auth.uid() = from_user);

CREATE TRIGGER update_jar_updated_at
  BEFORE UPDATE ON public.joint_account_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Joint accounts
CREATE TABLE IF NOT EXISTS public.joint_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  permissions_a jsonb NOT NULL DEFAULT '{}'::jsonb,
  permissions_b jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a <> user_b)
);
CREATE INDEX IF NOT EXISTS idx_ja_user_a ON public.joint_accounts(user_a);
CREATE INDEX IF NOT EXISTS idx_ja_user_b ON public.joint_accounts(user_b);

ALTER TABLE public.joint_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their joint accounts"
  ON public.joint_accounts FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Members can update their joint accounts"
  ON public.joint_accounts FOR UPDATE
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Members can insert joint accounts"
  ON public.joint_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE TRIGGER update_ja_updated_at
  BEFORE UPDATE ON public.joint_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notification trigger on new request
CREATE OR REPLACE FUNCTION public.notify_joint_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_name text;
BEGIN
  SELECT COALESCE(full_name, email, 'Someone') INTO v_from_name
    FROM public.profiles WHERE user_id = NEW.from_user LIMIT 1;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.to_user,
    'joint_request',
    'New Joint Account Request',
    COALESCE(v_from_name,'Someone') || ' invited you to form a Joint Intelligence Account.',
    jsonb_build_object('request_id', NEW.id, 'from_user', NEW.from_user)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_joint_request ON public.joint_account_requests;
CREATE TRIGGER trg_notify_joint_request
  AFTER INSERT ON public.joint_account_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_joint_request();