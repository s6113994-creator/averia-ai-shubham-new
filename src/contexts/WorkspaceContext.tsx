import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type WorkspaceMode = 'personal' | 'joint';

export interface WorkspacePartner {
  id: string;
  display_name: string | null;
  full_name: string | null;

  averia_id: string;
}

export interface WorkspaceState {
  mode: WorkspaceMode;
  workspaceId: string | null;
  partner: WorkspacePartner | null;
  myPermissions: Record<string, boolean>;
  theirPermissions: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<WorkspaceState>({
  mode: 'personal',
  workspaceId: null,
  partner: null,
  myPermissions: {},
  theirPermissions: {},
  loading: false,
  error: null,
  refresh: async () => {},
});

export const useWorkspace = () => useContext(Ctx);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const params = useParams();
  // Detect joint route from URL even outside <Route> match
  const pathWorkspaceId = (() => {
    const m = typeof window !== 'undefined' ? window.location.pathname.match(/^\/joint\/([^/?#]+)/) : null;
    return m ? m[1] : null;
  })();
  const workspaceId = (params as any)?.id || pathWorkspaceId;

  const [state, setState] = useState<Omit<WorkspaceState, 'refresh'>>({
    mode: 'personal',
    workspaceId: null,
    partner: null,
    myPermissions: {},
    theirPermissions: {},
    loading: false,
    error: null,
  });

  const load = useCallback(async () => {
    if (!user || !workspaceId) {
      setState((s) => ({ ...s, mode: 'personal', workspaceId: null, partner: null, myPermissions: {}, theirPermissions: {}, error: null }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data: ja, error: jaErr } = await supabase
        .from('joint_accounts')
        .select('*')
        .eq('id', workspaceId)
        .eq('active', true)
        .maybeSingle();
      if (jaErr || !ja) throw new Error('Shared Workspace connection failed');

      const otherId = ja.user_a === user.id ? ja.user_b : ja.user_a;
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, full_name, averia_id')
        .eq('user_id', otherId)
        .maybeSingle();

      const mine = (ja.user_a === user.id ? ja.permissions_a : ja.permissions_b) as Record<string, boolean>;
      const theirs = (ja.user_a === user.id ? ja.permissions_b : ja.permissions_a) as Record<string, boolean>;

      setState({
        mode: 'joint',
        workspaceId,
        partner: profs ? { id: profs.user_id, ...profs } as WorkspacePartner : null,
        myPermissions: mine || {},
        theirPermissions: theirs || {},
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setState((s) => ({ ...s, loading: false, error: e.message || 'Workspace error' }));
    }
  }, [user?.id, workspaceId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh on permission changes
  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`ws-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'joint_accounts', filter: `id=eq.${workspaceId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, load]);

  return <Ctx.Provider value={{ ...state, refresh: load }}>{children}</Ctx.Provider>;
}
