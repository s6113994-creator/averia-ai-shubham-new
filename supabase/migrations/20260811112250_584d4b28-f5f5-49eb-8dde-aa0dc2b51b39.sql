DROP VIEW IF EXISTS public.public_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Directory row visibility for signed-in users, but column-level privacy
CREATE POLICY "Signed-in users can look up profile directory"
ON public.profiles FOR SELECT TO authenticated
USING (true);

REVOKE SELECT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, user_id, full_name, display_name, avatar_url, averia_id, is_pro, created_at, updated_at)
  ON public.profiles TO authenticated;
GRANT UPDATE (full_name, display_name, avatar_url, push_subscription)
  ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Admin-only email lookup for payment review
CREATE OR REPLACE FUNCTION public.admin_get_user_email(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = _user_id;
  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_email(uuid) TO authenticated;

-- Lock down internal functions from the PUBLIC pseudo-role (default grant)
REVOKE ALL ON FUNCTION public.assign_admin_on_signup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_averia_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_shared_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_wallet_for_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_single_active_joint() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_joint_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_recompute_trust_score() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_trust_score(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.peer_has_permission(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trust_level(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_averia_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_cache() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_workspace_peer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_grants_to_peer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_peer_grants_to_me(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_peer_ai_conversations(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_peer_ai_messages(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_peer_chat_threads(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_peer_private_messages(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_peer_scan_history(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_peer_vault_items(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_personal_vault_pin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_personal_vault_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_personal_vault_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ats_pro_cycle() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_workspace_peer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_grants_to_peer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_peer_grants_to_me(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_peer_ai_conversations(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_peer_ai_messages(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_peer_chat_threads(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_peer_private_messages(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_peer_scan_history(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_peer_vault_items(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_personal_vault_pin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_personal_vault_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_personal_vault_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ats_pro_cycle() TO authenticated;