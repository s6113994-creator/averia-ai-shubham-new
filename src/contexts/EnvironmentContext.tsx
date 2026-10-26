import React, { createContext, useContext, useEffect, useState } from 'react';

export type EnvMode = 'PERSONAL' | 'JOINT';

const MODE_KEY = 'averia.env.mode';
const WS_KEY = 'averia.env.workspace';

interface EnvCtx {
  currentEnvironmentMode: EnvMode;
  activeWorkspaceId: string | null;
  setMode: (mode: EnvMode, workspaceId?: string | null) => void;
}

const Ctx = createContext<EnvCtx>({
  currentEnvironmentMode: 'PERSONAL',
  activeWorkspaceId: null,
  setMode: () => {},
});

export const useEnvironment = () => useContext(Ctx);

const ALIAS_KEY = 'active_averia_environment';

function syncAlias(mode: EnvMode, workspaceId: string | null) {
  try {
    localStorage.setItem(ALIAS_KEY, JSON.stringify({ mode, workspaceId }));
  } catch {}
}

function readInitial(): { mode: EnvMode; workspaceId: string | null } {
  if (typeof window === 'undefined') return { mode: 'PERSONAL', workspaceId: null };
  // URL takes precedence (deep-link to /joint/:id)
  const m = window.location.pathname.match(/^\/joint\/([^/?#]+)/);
  if (m) {
    localStorage.setItem(MODE_KEY, 'JOINT');
    localStorage.setItem(WS_KEY, m[1]);
    syncAlias('JOINT', m[1]);
    return { mode: 'JOINT', workspaceId: m[1] };
  }
  const stored = (localStorage.getItem(MODE_KEY) as EnvMode) || 'PERSONAL';
  const ws = localStorage.getItem(WS_KEY);
  const mode: EnvMode = stored === 'JOINT' ? 'JOINT' : 'PERSONAL';
  syncAlias(mode, ws);
  return { mode, workspaceId: ws };
}

export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(readInitial);

  // Re-sync if URL changes to /joint/:id at runtime
  useEffect(() => {
    const onPop = () => setState(readInitial());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setMode: EnvCtx['setMode'] = (mode, workspaceId = null) => {
    try {
      localStorage.setItem(MODE_KEY, mode);
      if (mode === 'JOINT' && workspaceId) localStorage.setItem(WS_KEY, workspaceId);
      else localStorage.removeItem(WS_KEY);
      syncAlias(mode, mode === 'JOINT' ? workspaceId : null);
      // Clear transient caches that may leak across modes
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('averia.cache.') || k.startsWith('rq:')) localStorage.removeItem(k);
      });
      sessionStorage.clear();
      sessionStorage.setItem('averia.switching', '1');
    } catch {}
    const target = mode === 'JOINT' && workspaceId ? `/joint/${workspaceId}` : '/dashboard';
    // Hard system refresh — Instagram-style isolation
    window.location.replace(target);
  };

  return (
    <Ctx.Provider value={{ currentEnvironmentMode: state.mode, activeWorkspaceId: state.workspaceId, setMode }}>
      {children}
    </Ctx.Provider>
  );
}
