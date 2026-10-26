import { useEnvironment } from '@/contexts/EnvironmentContext';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ScopeMode = 'PERSONAL' | 'JOINT';

export interface ActiveScope {
  mode: ScopeMode;
  isJoint: boolean;
  workspaceId: string | null;
  myId: string | null;
  peerId: string | null;
  loading: boolean;
}

/**
 * The unified, app-wide scope of the currently rendered data layer.
 * PERSONAL → bind to auth.uid().  JOINT → bind to shared_workspace_id.
 */
export function useScope(): ActiveScope {
  const { user } = useAuth();
  const { currentEnvironmentMode, activeWorkspaceId } = useEnvironment();
  const [peerId, setPeerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isJoint = currentEnvironmentMode === 'JOINT' && !!activeWorkspaceId;

  useEffect(() => {
    let cancelled = false;
    if (!isJoint || !activeWorkspaceId) { setPeerId(null); return; }
    setLoading(true);
    (async () => {
      // resilient: retry up to 3x silently
      for (let i = 0; i < 3 && !cancelled; i++) {
        const { data, error } = await supabase.rpc('current_workspace_peer', { _workspace_id: activeWorkspaceId });
        if (!error && data) { if (!cancelled) { setPeerId(data as string); setLoading(false); } return; }
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isJoint, activeWorkspaceId]);

  return {
    mode: isJoint ? 'JOINT' : 'PERSONAL',
    isJoint,
    workspaceId: isJoint ? activeWorkspaceId : null,
    myId: user?.id ?? null,
    peerId,
    loading,
  };
}
