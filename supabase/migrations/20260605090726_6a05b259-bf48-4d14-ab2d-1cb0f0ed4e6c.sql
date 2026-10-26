
-- 1) Extend peer_has_permission to accept new master keys (dashboard, agentic, chat)
--    while keeping backward-compat with legacy ones.
CREATE OR REPLACE FUNCTION public.peer_has_permission(_workspace_id uuid, _target_user uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ja public.joint_accounts%ROWTYPE;
  caller uuid := auth.uid();
  perms jsonb;
  normalized text;
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

  -- Normalize legacy → triple-permission system
  normalized := CASE _permission
    WHEN 'public_content' THEN 'dashboard'
    WHEN 'personal'       THEN 'dashboard'
    WHEN 'averia_content' THEN 'agentic'
    WHEN 'user_content'   THEN 'dashboard'
    ELSE _permission
  END;

  RETURN COALESCE((perms ->> normalized)::boolean, (perms ->> _permission)::boolean, false);
END;
$function$;

-- 2) Lookup helper: return JSON of which perms peer granted TO caller
CREATE OR REPLACE FUNCTION public.get_peer_grants_to_me(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE ja public.joint_accounts%ROWTYPE; caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RETURN '{}'::jsonb; END IF;
  SELECT * INTO ja FROM public.joint_accounts
    WHERE id = _workspace_id AND active = true AND (user_a = caller OR user_b = caller)
    LIMIT 1;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  -- Permissions FROM the peer (so if caller is user_a, peer is user_b, peer's grants = permissions_b)
  IF ja.user_a = caller THEN RETURN COALESCE(ja.permissions_b, '{}'::jsonb);
  ELSE RETURN COALESCE(ja.permissions_a, '{}'::jsonb);
  END IF;
END;
$$;

-- 3) Symmetric: my grants to peer
CREATE OR REPLACE FUNCTION public.get_my_grants_to_peer(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE ja public.joint_accounts%ROWTYPE; caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RETURN '{}'::jsonb; END IF;
  SELECT * INTO ja FROM public.joint_accounts
    WHERE id = _workspace_id AND active = true AND (user_a = caller OR user_b = caller)
    LIMIT 1;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  IF ja.user_a = caller THEN RETURN COALESCE(ja.permissions_a, '{}'::jsonb);
  ELSE RETURN COALESCE(ja.permissions_b, '{}'::jsonb);
  END IF;
END;
$$;

-- 4) Add environment_context to per-user scoped tables for isolation (default 'personal')
ALTER TABLE public.scan_history   ADD COLUMN IF NOT EXISTS environment_context text NOT NULL DEFAULT 'personal';
ALTER TABLE public.saved_news     ADD COLUMN IF NOT EXISTS environment_context text NOT NULL DEFAULT 'personal';
ALTER TABLE public.vault_items    ADD COLUMN IF NOT EXISTS environment_context text NOT NULL DEFAULT 'personal';
ALTER TABLE public.user_posts     ADD COLUMN IF NOT EXISTS environment_context text NOT NULL DEFAULT 'personal';

CREATE INDEX IF NOT EXISTS idx_scan_history_env ON public.scan_history(user_id, environment_context);
CREATE INDEX IF NOT EXISTS idx_saved_news_env   ON public.saved_news(user_id, environment_context);
CREATE INDEX IF NOT EXISTS idx_vault_items_env  ON public.vault_items(user_id, environment_context);
