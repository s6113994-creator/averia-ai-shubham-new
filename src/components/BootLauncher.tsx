import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const LAUNCH_KEY = 'averia.defaultLaunch';

/**
 * Root-level Default Launch interceptor.
 * On every fresh app boot (and on '/' navigations), reads the stored preference
 * and warps the workspace to the user's chosen shell BEFORE any UI interaction.
 * Runs once per auth-resolved session.
 */
export function BootLauncher() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fired = useRef(false);

  useEffect(() => {
    if (loading || fired.current) return;
    if (!user) return;
    if (location.pathname !== '/') return;

    const dest = '/averia-ai';

    fired.current = true;
    navigate(dest, { replace: true });
  }, [user, loading, location.pathname, navigate]);

  return null;
}
