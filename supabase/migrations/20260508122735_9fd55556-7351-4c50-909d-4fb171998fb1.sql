
DROP POLICY IF EXISTS "System can insert trust scores" ON public.user_trust_scores;
DROP POLICY IF EXISTS "System can update trust scores" ON public.user_trust_scores;

REVOKE EXECUTE ON FUNCTION public.recompute_trust_score(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_recompute_trust_score() FROM PUBLIC, anon;
