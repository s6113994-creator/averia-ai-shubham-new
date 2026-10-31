import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { UserAvatar } from '@/components/UserAvatar';

interface Profile { avatar_url: string | null; full_name: string | null; display_name: string | null; }

/**
 * Instagram-style global profile anchor.
 * - Personal: single uploaded DP.
 * - Joint: dual overlapping avatars (self + partner).
 * - Click => navigate to /dashboard.
 */
export function GlobalProfileAnchor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { currentEnvironmentMode, activeWorkspaceId } = useEnvironment();
  const [me, setMe] = useState<Profile | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('profiles')
        .select('avatar_url, full_name, display_name')
        .eq('user_id', user.id).maybeSingle();
      setMe((data as any) || null);
    })();
  }, [user?.id]);

  useEffect(() => {
    setPartner(null);
    if (!user || currentEnvironmentMode !== 'JOINT' || !activeWorkspaceId) return;
    (async () => {
      const { data: ja } = await supabase.from('joint_accounts')
        .select('user_a, user_b').eq('id', activeWorkspaceId).maybeSingle();
      if (!ja) return;
      const partnerId = (ja as any).user_a === user.id ? (ja as any).user_b : (ja as any).user_a;
      const { data: p } = await supabase.from('profiles')
        .select('avatar_url, full_name, display_name')
        .eq('user_id', partnerId).maybeSingle();
      setPartner((p as any) || null);
    })();
  }, [user?.id, currentEnvironmentMode, activeWorkspaceId]);

  if (!user) return null;

  const myName = me?.display_name || me?.full_name || (user.user_metadata as any)?.full_name || user.email?.split('@')[0] || 'You';
  const myUrl = me?.avatar_url || (user.user_metadata as any)?.avatar_url || null;
  const partnerName = partner?.display_name || partner?.full_name || 'Partner';
  const partnerUrl = partner?.avatar_url || null;
  const isJoint = currentEnvironmentMode === 'JOINT' && !!activeWorkspaceId;

  return (
    <button
      onClick={() => navigate('/dashboard')}
      aria-label="Open dashboard"
      title={isJoint ? `${myName} + ${partnerName}` : myName}
      data-app-chrome
      className="fixed top-3 left-16 md:left-20 z-[46] hover:scale-105 transition flex items-center gap-2 bg-background/80 backdrop-blur-md border border-border/60 rounded-full p-1.5 shadow-lg"
    >
      {isJoint ? (
        <span className="relative inline-flex items-center h-8">
          <span className="relative z-10 rounded-full ring-2 ring-background shadow">
            <UserAvatar url={myUrl} name={myName} size="sm" />
          </span>
          <span className="-ml-3 rounded-full ring-2 ring-background shadow">
            <UserAvatar url={partnerUrl} name={partnerName} size="sm" />
          </span>
        </span>
      ) : (
        <span className="rounded-full ring-2 ring-primary/40 shadow inline-flex">
          <UserAvatar url={myUrl} name={myName} size="sm" />
        </span>
      )}
      <span className="text-xs font-medium pr-2 hidden sm:inline truncate max-w-[100px]">{myName}</span>
    </button>
  );
}
