-- 1. PROFILES: remove blanket authenticated read
DROP POLICY IF EXISTS "Authenticated can lookup profiles by averia_id" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT user_id, display_name, full_name, avatar_url, averia_id, is_pro
FROM public.profiles;

REVOKE ALL ON public.public_profiles FROM anon, authenticated;
GRANT SELECT ON public.public_profiles TO authenticated;

-- 2. API CACHE: read-only for clients, writes only via service role
DROP POLICY IF EXISTS "Anyone can insert cache" ON public.api_cache;
DROP POLICY IF EXISTS "Anyone can read cache" ON public.api_cache;

CREATE POLICY "Anyone can read cache"
ON public.api_cache FOR SELECT TO anon, authenticated
USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.api_cache FROM anon, authenticated;
GRANT SELECT ON public.api_cache TO anon, authenticated;
GRANT ALL ON public.api_cache TO service_role;

-- 3. VAULT ITEMS: public items only for signed-in users
DROP POLICY IF EXISTS "Public vault items are viewable by all" ON public.vault_items;

CREATE POLICY "Public vault items are viewable by signed-in users"
ON public.vault_items FOR SELECT TO authenticated
USING (vault_type = 'public'::vault_type);

-- 4. SECURITY DEFINER functions: lock down direct execution
REVOKE ALL ON FUNCTION public.assign_admin_on_signup() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_averia_id() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_shared_workspace() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_wallet_for_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_single_active_joint() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_joint_request() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recompute_trust_score() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_trust_score(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.peer_has_permission(uuid, uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_trust_level(integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_averia_id() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_cache() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;

-- App-facing RPCs: signed-in users only (never anon)
REVOKE ALL ON FUNCTION public.current_workspace_peer(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_grants_to_peer(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_peer_grants_to_me(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_peer_ai_conversations(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_peer_ai_messages(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_peer_chat_threads(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_peer_private_messages(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_peer_scan_history(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_peer_vault_items(uuid, uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.has_personal_vault_pin() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_personal_vault_pin(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_personal_vault_pin(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ats_pro_cycle() FROM anon, authenticated;

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