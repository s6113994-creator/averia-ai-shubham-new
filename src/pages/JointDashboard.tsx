import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useEnvironment } from '@/contexts/EnvironmentContext';

/**
 * /joint/:id is now a thin entry that activates JOINT scope and bounces to the
 * unified dashboard. The same Averia AI surface renders for both Personal and
 * Joint scopes — no separate page tree.
 */
export default function JointDashboard() {
  const { id } = useParams();
  const { currentEnvironmentMode, activeWorkspaceId, setMode } = useEnvironment();

  useEffect(() => {
    if (id && (currentEnvironmentMode !== 'JOINT' || activeWorkspaceId !== id)) {
      setMode('JOINT', id); // hard reload to /dashboard in JOINT scope
    }
  }, [id, currentEnvironmentMode, activeWorkspaceId, setMode]);

  return <Navigate to="/dashboard" replace />;
}
