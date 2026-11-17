import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Fingerprint, Copy } from 'lucide-react';
import { TrustScoreCard } from '@/components/dashboard/TrustScoreCard';
import { TripleVault } from '@/components/dashboard/TripleVault';
import { DashboardMenu } from '@/components/dashboard/DashboardMenu';
import { IdentityIconCluster } from '@/components/dashboard/IdentityIconCluster';
import { JointAccessCluster } from '@/components/dashboard/JointAccessCluster';
import { AccessMirrorBanner } from '@/components/dashboard/AccessMirrorBanner';
import { SharingSummaryCard } from '@/components/dashboard/SharingSummaryCard';
import { UserAvatar } from '@/components/UserAvatar';
import { ReadOnlyScopeProvider } from '@/contexts/ReadOnlyScopeContext';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ProBadge } from '@/components/ProBadge';
import { NeuralIdentitySetup } from '@/components/NeuralIdentitySetup';
import { useScope } from '@/lib/scope';

interface ProfileData {
  full_name: string | null; display_name: string | null; averia_id: string | null; is_pro: boolean; avatar_url?: string | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const scope = useScope();

  const [profile, setProfile] = useState<ProfileData>({ full_name: '', display_name: null, averia_id: null, is_pro: false });
  const [peerProfile, setPeerProfile] = useState<ProfileData | null>(null);
  const [mirrorPeer, setMirrorPeer] = useState(false);

  useEffect(() => { if (!user) { navigate('/auth'); return; } fetchProfile(); /* eslint-disable-next-line */ }, [user]);

  useEffect(() => {
    if (!scope.isJoint || !scope.peerId) { setPeerProfile(null); return; }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, display_name, averia_id, is_pro, avatar_url')
        .eq('user_id', scope.peerId)
        .maybeSingle();
      if (data) setPeerProfile(data as any);
    })();
  }, [scope.isJoint, scope.peerId]);

  const fetchProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('full_name, display_name, averia_id, is_pro, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) setProfile(data as any);
  };

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (!user) return null;

  const myName = profile.display_name || profile.full_name || (user.email?.split('@')[0] ?? 'Agent');
  const peerName = peerProfile?.display_name || peerProfile?.full_name || 'Partner';
  const title = scope.isJoint ? 'Joint Dashboard' : 'your Dashboard';
  const identityName = scope.isJoint ? `you + ${peerName}` : myName;
  const identityAveria = scope.isJoint && peerProfile?.averia_id && profile.averia_id
    ? `${profile.averia_id} + ${peerProfile.averia_id}`
    : profile.averia_id;

  const mirrorUserId = mirrorPeer ? scope.peerId ?? undefined : undefined;
  const mirrorWs = mirrorPeer ? scope.workspaceId ?? undefined : undefined;
  const trustUserId = mirrorPeer ? scope.peerId ?? undefined : user.id;
  const trustName = mirrorPeer ? peerName : undefined;

  return (
    <Layout>
      <NeuralIdentitySetup />
      <div className="container mx-auto px-4 pt-0 pb-6 sm:pb-8">
        <div className="max-w-5xl mx-auto">
          {/* ===== Unified command-row header ===== */}
          <div className="mb-6">
            <div className="flex flex-row items-center justify-between gap-3 mb-3 h-14 pl-14 pr-14 md:pl-0">
              <h1 className="font-heading text-lg md:text-xl font-semibold leading-none whitespace-nowrap">
                {title.split(' ').map((w, i, arr) =>
                  i === arr.length - 1 ? <span key={i} className="gradient-text">{w}</span> : <span key={i}>{w} </span>
                )}
              </h1>
              <DashboardMenu onScrollTo={scrollTo} />
            </div>

            {/* Identity row — with profile picture frame(s) */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <UserAvatar url={profile.avatar_url} name={myName} size="md" />
                {scope.isJoint && peerProfile && (
                  <>
                    <span className="text-muted-foreground/60 font-light text-lg">+</span>
                    <UserAvatar url={peerProfile.avatar_url} name={peerName} size="md" />
                  </>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-heading font-semibold text-base sm:text-lg truncate">{identityName}</p>
                {identityAveria && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(identityAveria!); toast.success('Averia ID copied'); }}
                    className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono text-primary hover:underline"
                  >
                    <Fingerprint className="h-3 w-3" /> {identityAveria} <Copy className="h-2.5 w-2.5 opacity-60" />
                  </button>
                )}
              </div>
              {!scope.isJoint && (
                <div className="ml-auto">
                  <IdentityIconCluster />
                </div>
              )}
            </div>

            {/* JOINT-only multi-node Access cluster */}
            {scope.isJoint && (
              <JointAccessCluster
                peerName={peerName}
                peerId={scope.peerId}
                mirrorPeer={mirrorPeer}
                onToggleMirror={() => setMirrorPeer(v => !v)}
              />
            )}

            {profile.is_pro && <div className="mt-2"><ProBadge variant="small" /></div>}
          </div>

          {scope.isJoint && (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-200/90 flex items-center gap-2">
              <Users className="h-3 w-3" /> Joint Brain active — both partners share this workspace
            </div>
          )}

          {/* ===== Mirror Portal wrapper (read-only when active) ===== */}
          <ReadOnlyScopeProvider value={mirrorPeer}>
            {mirrorPeer && <AccessMirrorBanner peerName={peerName} onExit={() => setMirrorPeer(false)} />}

            <motion.div
              key={mirrorPeer ? 'mirror' : 'self'}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <TrustScoreCard userId={trustUserId} name={trustName} />
              <TripleVault userId={mirrorUserId} peerWorkspaceId={mirrorWs} />
              {!scope.isJoint && !mirrorPeer && <SharingSummaryCard />}
            </motion.div>
          </ReadOnlyScopeProvider>
        </div>
      </div>
    </Layout>
  );
}
