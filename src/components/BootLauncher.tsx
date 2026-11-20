import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * Root-level Default Launch interceptor.
 * On auth-resolved session, automatically routes authenticated users landing
 * on entry points ('/', '/auth') to the main Averia AI dashboard/chat view ('/averia-ai').
 */
export function BootLauncher() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (location.pathname === '/' || location.pathname === '/auth') {
      navigate('/averia-ai', { replace: true });
    }
  }, [user, loading, location.pathname, navigate]);

  return null;
}
